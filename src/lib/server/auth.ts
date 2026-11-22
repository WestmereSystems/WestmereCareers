import "server-only";
import { assertLaunchAccount } from "./launch";
import { businessFor } from "./business";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/server/http";
import {
  billingModeFor,
  billingPlans,
  type BillingMode,
} from "@/lib/premium/billing-mode";

export function hasCurrentPremiumSubscription(
  subscription: {
    status: string;
    current_period_start: string | null;
    current_period_end: string | null;
    price_id: string | null;
    livemode?: boolean;
  } | null,
  now = Date.now(),
  mode: BillingMode = "test",
) {
  if (!subscription || !["active", "trialing"].includes(subscription.status))
    return false;
  let expectedPrice: string | undefined;
  try {
    expectedPrice =
      mode === "live"
        ? billingPlans("live").find((p) => p.code === "careers_plus")?.priceId
        : process.env.STRIPE_PRICE_ID;
  } catch {
    return false;
  }
  if (
    !expectedPrice ||
    subscription.price_id !== expectedPrice ||
    Boolean(subscription.livemode) !== (mode === "live")
  )
    return false;
  const start = Date.parse(subscription.current_period_start || "");
  const end = Date.parse(subscription.current_period_end || "");
  return (
    Number.isFinite(start) && Number.isFinite(end) && start <= now && end > now
  );
}

export async function getSessionContext() {
  const supabase = await createClient();
  if (!supabase)
    return {
      supabase: null,
      user: null as User | null,
      isPremium: false,
      business: null,
      enterpriseCareersAccess: null,
    };
  // getUser validates with Supabase Auth; no user-editable metadata or local demo flag grants access.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (
    authError &&
    authError.name !== "AuthSessionMissingError" &&
    authError.status !== 400 &&
    authError.status !== 401 &&
    authError.status !== 403
  ) {
    throw new ApiError(
      503,
      "Sign-in is temporarily unavailable. Please try again.",
      "AUTH_UNAVAILABLE",
    );
  }
  if (!user)
    return {
      supabase,
      user: null as User | null,
      isPremium: false,
      business: null,
      enterpriseCareersAccess: null,
    };
  const launchAccess = await assertLaunchAccount(supabase);
  const subscriptionQuery = supabase
    .from("subscriptions")
    .select("status,current_period_start,current_period_end,price_id,livemode")
    .eq("user_id", user.id)
    .maybeSingle();
  const [{ data: subscription }, { data: testing }] = await Promise.all([
    subscriptionQuery,
    supabase.rpc("my_testing_access"),
  ]);
  // Fail closed when billing state is missing, stale or unreadable.
  const registeredBusiness = await businessFor(
    supabase,
    user.id,
    testing || null,
  );
  const pendingBusiness =
    !registeredBusiness &&
    !launchAccess.marketplaceOpen &&
    launchAccess.applicantAllowed === false &&
    (launchAccess.kind === "employer" || launchAccess.kind === "agency");
  const business =
    registeredBusiness ||
    (pendingBusiness
      ? {
          needsOnboarding: true,
          kind: launchAccess.kind as "employer" | "agency",
          defaultOrganisationId: null,
          tradingName: "Complete your business registration",
          verified: false,
          pending: false,
          tier: null,
          organisations: [],
        }
      : null);
  const enterprise = business
    ? await supabase.rpc("my_enterprise_careers_access")
    : null;
  if (enterprise?.error)
    throw new ApiError(503, "Your Enterprise access could not be checked.");
  const enterpriseCareersAccess = enterprise?.data as {
    startsAt: string;
    expiresAt: string;
  } | null;
  const testingAccess = testing as {
    tier: string;
    startsAt: string;
    expiresAt: string;
  } | null;
  return {
    launchAccess,
    business,
    supabase,
    user,
    enterpriseCareersAccess,
    isPremium: business
      ? Boolean(enterpriseCareersAccess)
      : hasCurrentPremiumSubscription(
          subscription,
          Date.now(),
          billingModeFor(user, "individual"),
        ) || testingAccess?.tier === "careers_plus",
    testingAccess,
  };
}

export async function requireSession() {
  const context = await getSessionContext();
  if (!context.supabase)
    throw new ApiError(
      503,
      "Account services are being configured. Please check back soon.",
      "SERVICE_NOT_CONFIGURED",
    );
  if (!context.user)
    throw new ApiError(401, "Sign in to continue.", "SIGN_IN_REQUIRED");
  return { ...context, supabase: context.supabase, user: context.user };
}
