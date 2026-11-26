import "server-only";
import { createHash, createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { premiumAdmin } from "@/lib/premium/providers";
import { adsConfig } from "./config";
import {
  ADS_CONSENT_VERSION,
  ADS_COOKIE,
  ADS_OPTOUT_COOKIE,
  clickIdentifiers,
  type AdIdentifiers,
  type AdsBrowserState,
} from "./contracts";

export type AdContext = {
  id: string;
  owner_user_id: string | null;
  measurement: boolean;
  ad_user_data: boolean;
  enhanced: boolean;
  consent_version: string;
  granted_at: string | null;
  user_data_granted_at: string | null;
  enhanced_granted_at: string | null;
  withdrawn_at: string | null;
  identifiers: AdIdentifiers;
  identifiers_at: string | null;
  email_hash: string | null;
  expires_at: string;
  created_at: string;
};
export function hashEmployerEmail(email: string) {
  const [local, domain] = email.trim().toLowerCase().split("@");
  if (!local || !domain) return null;
  const normalized = `${["gmail.com", "googlemail.com"].includes(domain) ? local.replaceAll(".", "") : local}@${domain}`;
  return createHash("sha256").update(normalized).digest("hex");
}
export function contextPermits(
  context: AdContext | null,
  occurredAt: string,
  now = Date.now(),
) {
  const at = Date.parse(occurredAt);
  return Boolean(
    context &&
    context.measurement &&
    context.ad_user_data &&
    context.consent_version === ADS_CONSENT_VERSION &&
    !context.withdrawn_at &&
    Date.parse(context.expires_at) > now &&
    context.granted_at &&
    Date.parse(context.granted_at) <= at &&
    context.user_data_granted_at &&
    Date.parse(context.user_data_granted_at) <= at,
  );
}
export function permittedEmail(
  context: AdContext,
  occurredAt: string,
  enabled: boolean,
) {
  return enabled &&
    context.enhanced &&
    context.enhanced_granted_at &&
    Date.parse(context.enhanced_granted_at) <= Date.parse(occurredAt)
    ? context.email_hash
    : null;
}
export type ContextUpdate = {
  measurement?: boolean;
  adUserData?: boolean;
  enhanced?: boolean;
  identifiers?: AdIdentifiers;
  gpc?: boolean;
};
export async function browserAdsState(
  request: Request,
  update?: ContextUpdate,
): Promise<AdsBrowserState> {
  const config = adsConfig();
  const empty: AdsBrowserState = {
    enabled: config.ui,
    delivery: config.tag,
    tagId: config.tag ? config.tagId : "",
    enhancedAvailable: config.enhanced,
    consent: null,
    registration: null,
  };
  if (!config.ui) return empty;
  const jar = await cookies();
  if (!config.capture) {
    // Local visual review has no database, identifiers, tag or external upload.
    let consent: AdsBrowserState["consent"] = null;
    try {
      const saved = JSON.parse(jar.get("westmere-ad-preview")?.value || "null");
      if (saved && typeof saved.measurement === "boolean") consent = saved;
    } catch {
      /* No preference. */
    }
    if (
      update &&
      (update.measurement !== undefined || update.adUserData !== undefined)
    ) {
      consent = {
        measurement: update.measurement === true,
        adUserData: update.adUserData === true,
        enhanced: false,
        version: ADS_CONSENT_VERSION,
      };
      jar.set("westmere-ad-preview", JSON.stringify(consent), {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 3600,
      });
    }
    return { ...empty, consent };
  }
  const token = jar.get(ADS_COOKIE)?.value;
  const admin = premiumAdmin();
  let context: AdContext | null = null;
  if (token && /^[a-f0-9-]{36}$/.test(token)) {
    const read = await admin
      .from("ads_contexts")
      .select("*")
      .eq("id", token)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (read.error) throw new Error("MEASUREMENT_CONTEXT_UNAVAILABLE");
    context = read.data;
  }
  const db = await createClient();
  const auth = db ? await db.auth.getUser() : null;
  const user = auth?.data.user;
  // A context's attribution cannot be transferred to another signed-in account.
  // Preferences can be retained, but the identifiers and matching data are cleared.
  const switched = Boolean(
    context?.owner_user_id && context.owner_user_id !== user?.id,
  );
  const stalePolicy = Boolean(
    context && context.consent_version !== ADS_CONSENT_VERSION,
  );
  const explicitChoice =
    update?.measurement !== undefined || update?.adUserData !== undefined;
  const gpc =
    request.headers.get("sec-gpc") === "1" ||
    update?.gpc === true ||
    (!explicitChoice && jar.get(ADS_OPTOUT_COOKIE)?.value === "1");
  if (stalePolicy && !explicitChoice) return empty;
  if (
    update &&
    (context ||
      update.measurement !== undefined ||
      update.adUserData !== undefined)
  ) {
    const now = new Date().toISOString();
    if (
      !gpc &&
      update.measurement !== false &&
      update.adUserData !== false &&
      update.enhanced !== false
    ) {
      const network = (
        request.headers.get("x-vercel-forwarded-for") ||
        request.headers.get("x-forwarded-for") ||
        "local"
      )
        .split(",")[0]
        .trim();
      const key = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!)
        .update(`ads-choice:${now.slice(0, 10)}:${network}`)
        .digest("hex");
      const rate = await admin.rpc("ads_context_allowed", { p_network: key });
      if (rate.error || rate.data !== true)
        throw new Error("MEASUREMENT_CHOICE_RATE_LIMITED");
    }
    const measurement =
      !gpc &&
      (update.measurement ??
        (stalePolicy ? false : context?.measurement) ??
        false);
    const adUserData =
      !gpc &&
      (update.adUserData ??
        (stalePolicy ? false : context?.ad_user_data) ??
        false);
    const enhanced =
      measurement &&
      adUserData &&
      config.enhanced &&
      (update.enhanced ?? context?.enhanced ?? false);
    const ids =
      measurement && adUserData
        ? clickIdentifiers(update.identifiers || {})
        : {};
    const differentClick = Boolean(
      context &&
      Object.keys(context.identifiers).length &&
      Object.keys(ids).length &&
      JSON.stringify(ids) !==
        JSON.stringify(clickIdentifiers(context.identifiers)),
    );
    const fresh = !context || switched || differentClick || stalePolicy;
    const value = {
      measurement,
      ad_user_data: adUserData,
      enhanced,
      consent_version: ADS_CONSENT_VERSION,
      granted_at: measurement
        ? fresh || !context?.measurement
          ? now
          : context.granted_at
        : null,
      user_data_granted_at: adUserData
        ? fresh || !context?.ad_user_data
          ? now
          : context.user_data_granted_at
        : null,
      enhanced_granted_at: enhanced
        ? fresh || !context?.enhanced
          ? now
          : context.enhanced_granted_at
        : null,
      withdrawn_at: measurement && adUserData ? null : now,
      identifiers:
        measurement && adUserData
          ? Object.keys(ids).length
            ? ids
            : fresh
              ? {}
              : context!.identifiers
          : {},
      identifiers_at: Object.keys(ids).length
        ? fresh || !Object.keys(context?.identifiers || {}).length
          ? now
          : context!.identifiers_at
        : fresh
          ? null
          : context?.identifiers_at,
      email_hash: enhanced && !fresh ? context?.email_hash : null,
      updated_at: now,
    };
    const write = fresh
      ? await admin.from("ads_contexts").insert(value).select().single()
      : await admin
          .from("ads_contexts")
          .update(value)
          .eq("id", context!.id)
          .select()
          .single();
    if (write.error) throw new Error("MEASUREMENT_CHOICE_UNAVAILABLE");
    context = write.data as AdContext;
    jar.set(ADS_COOKIE, context.id, {
      httpOnly: true,
      secure: new URL(request.url).protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: 90 * 86400,
    });
    if (user && !switched && (!measurement || !adUserData)) {
      // Withdrawal by the signed-in owner also stops queued imports linked to
      // other consent records for this same commercial account.
      const revoked = await admin
        .from("ads_contexts")
        .update({
          measurement: false,
          ad_user_data: false,
          enhanced: false,
          email_hash: null,
          identifiers: {},
          withdrawn_at: now,
          updated_at: now,
        })
        .eq("owner_user_id", user.id);
      if (revoked.error) throw new Error("MEASUREMENT_WITHDRAWAL_UNAVAILABLE");
    }
    if (user?.email_confirmed_at && user.email) {
      const binding = await admin.rpc("ads_bind_context", {
        p_context: context.id,
        p_user: user.id,
        p_email_hash: enhanced ? hashEmployerEmail(user.email) : null,
      });
      if (binding.error) throw new Error("MEASUREMENT_BINDING_UNAVAILABLE");
      if (binding.data)
        context = {
          ...context,
          owner_user_id: user.id,
          email_hash: enhanced ? hashEmployerEmail(user.email) : null,
        };
    }
  }
  if (!context) return empty;
  const state: AdsBrowserState = {
    ...empty,
    consent: {
      measurement: !gpc && context.measurement,
      adUserData: !gpc && context.ad_user_data,
      enhanced: !gpc && context.enhanced,
      version: context.consent_version,
    },
  };
  if (
    !config.tag ||
    gpc ||
    switched ||
    !user ||
    context.owner_user_id !== user.id
  )
    return state;
  const employer = await admin
    .from("ads_employers")
    .select("id")
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (employer.error) throw new Error("MEASUREMENT_IDENTITY_UNAVAILABLE");
  if (!employer.data) return state;
  const eligible = await admin.rpc("ads_delivery_eligible", {
    p_employer: employer.data.id,
  });
  if (eligible.error) throw new Error("MEASUREMENT_IDENTITY_UNAVAILABLE");
  if (eligible.data !== true) return state;
  const event = await admin
    .from("ads_conversion_events")
    .select("id,transaction_id,occurred_at,context_id")
    .eq("employer_id", employer.data.id)
    .eq("kind", "registration")
    .eq("status", "queued")
    .maybeSingle();
  if (event.error) throw new Error("MEASUREMENT_EVENT_UNAVAILABLE");
  const row = event.data;
  if (
    row &&
    row.context_id === context.id &&
    contextPermits(context, row.occurred_at) &&
    Date.parse(row.occurred_at) >= config.start &&
    Date.now() - Date.parse(row.occurred_at) <= 86400000
  ) {
    const emailHash = permittedEmail(context, row.occurred_at, config.enhanced);
    state.registration = {
      id: row.id,
      transactionId: row.transaction_id,
      sendTo: `${config.tagId}/${config.label}`,
      value: 0,
      currency: "AUD",
      ...(emailHash ? { emailHash } : {}),
    };
  }
  return state;
}
