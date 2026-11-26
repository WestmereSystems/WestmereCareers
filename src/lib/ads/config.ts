import "server-only";

type Environment = Record<string, string | undefined>;
const real = (value: string | undefined) =>
  Boolean(value && !/[<>]|placeholder|replace_me|your_/i.test(value));
export function adsConfig(env: Environment = process.env) {
  let origin = "";
  try {
    origin = new URL(env.NEXT_PUBLIC_SITE_URL || "").origin;
  } catch {
    /* Disabled below. */
  }
  const domains = (env.GOOGLE_ADS_PRODUCTION_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const production =
    env.NODE_ENV === "production" &&
    env.VERCEL_ENV === "production" &&
    origin.startsWith("https://") &&
    domains.includes(origin);
  const start = Date.parse(env.GOOGLE_ADS_TRACKING_START_AT || "");
  const capture =
    production &&
    env.GOOGLE_ADS_CAPTURE_ENABLED === "true" &&
    Number.isFinite(start);
  const policyReady = real(env.GOOGLE_ADS_CONSENT_POLICY_REFERENCE);
  const tagId = /^AW-\d+$/.test(env.GOOGLE_ADS_TAG_ID || "")
    ? env.GOOGLE_ADS_TAG_ID!
    : "";
  const label = /^[A-Za-z0-9_-]{8,80}$/.test(
    env.GOOGLE_ADS_REGISTRATION_LABEL || "",
  )
    ? env.GOOGLE_ADS_REGISTRATION_LABEL!
    : "";
  const tag =
    capture &&
    policyReady &&
    Boolean(tagId && label) &&
    env.GOOGLE_ADS_DELIVERY_ENABLED === "true";
  const customerId = /^\d{10}$/.test(
    env.GOOGLE_ADS_CONVERSION_CUSTOMER_ID || "",
  )
    ? env.GOOGLE_ADS_CONVERSION_CUSTOMER_ID!
    : "";
  const purchaseActionId = /^\d+$/.test(
    env.GOOGLE_ADS_PURCHASE_IMPORT_ACTION_ID || "",
  )
    ? env.GOOGLE_ADS_PURCHASE_IMPORT_ACTION_ID!
    : "";
  const loginId = env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || customerId;
  const oauthReady = [
    env.GOOGLE_DATA_MANAGER_CLIENT_ID,
    env.GOOGLE_DATA_MANAGER_CLIENT_SECRET,
    env.GOOGLE_DATA_MANAGER_REFRESH_TOKEN,
  ].every(real);
  const purchase =
    capture &&
    policyReady &&
    env.GOOGLE_ADS_DELIVERY_ENABLED === "true" &&
    env.GOOGLE_ADS_PURCHASE_ROUTE === "server_import" &&
    Boolean(
      customerId && purchaseActionId && /^\d{10}$/.test(loginId) && oauthReady,
    );
  return {
    production,
    capture,
    tag,
    purchase,
    origin,
    start,
    tagId,
    label,
    customerId,
    loginId,
    purchaseActionId,
    enhanced: tag && env.GOOGLE_ADS_ENHANCED_CONVERSIONS_ENABLED === "true",
    ui:
      tag ||
      (env.GOOGLE_ADS_PRIVACY_UI_PREVIEW === "true" &&
        env.NODE_ENV !== "production"),
  };
}
