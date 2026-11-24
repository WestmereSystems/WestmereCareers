import "server-only";
import { sandboxPlans } from "@/lib/billing-plans";
import { PremiumError } from "./http";

export type BillingMode = "test" | "live";
// Additional testers are designated through privileged Auth app_metadata only.
// Never read this flag from user_metadata, a request body or a browser preference.
export const sandboxOwnerId = "563e67cd-32d5-4e8c-a70a-2c0b51195bb6";
export function billingModeFor(
  user: { id: string; app_metadata?: Record<string, unknown> },
  audience: string,
): BillingMode {
  if (
    user.id === sandboxOwnerId ||
    user.app_metadata?.westmere_billing_test === true
  )
    return "test";
  return process.env.NODE_ENV === "production" ||
    process.env.STRIPE_BUSINESS_LIVE_ENABLED === "true"
    ? "live"
    : "test";
}
export function billingPlans(mode: BillingMode) {
  if (mode === "test") return sandboxPlans.map((p) => ({ ...p }));
  let ids: Record<string, { priceId?: string; productId?: string }>;
  try {
    ids = JSON.parse(process.env.STRIPE_LIVE_PLANS || "{}");
  } catch {
    throw new PremiumError(
      "NOT_CONFIGURED",
      "Business payments are being prepared. No payment has been taken.",
      503,
    );
  }
  return sandboxPlans.map((p) => ({
    ...p,
    priceId: ids[p.code]?.priceId || "",
    productId: ids[p.code]?.productId || "",
  }));
}
export function livePortal(audience: string, restricted = false) {
  const value =
    process.env[
      `STRIPE_LIVE_PORTAL_${restricted ? "RESTRICTED" : audience.toUpperCase()}`
    ];
  if (!value?.startsWith("bpc_"))
    throw new PremiumError(
      "NOT_CONFIGURED",
      "Business billing management is being prepared.",
      503,
    );
  return value;
}

export function liveBusinessBillingReady() {
  try {
    return (
      /^(sk|rk)_live_/.test(process.env.STRIPE_LIVE_SECRET_KEY || "") &&
      Boolean(process.env.STRIPE_LIVE_WEBHOOK_SECRET?.startsWith("whsec_")) &&
      billingPlans("live")
        .filter((p) => p.audience !== "individual")
        .every(
          (p) =>
            p.priceId.startsWith("price_") && p.productId.startsWith("prod_"),
        ) &&
      ["EMPLOYER", "AGENCY", "RESTRICTED"].every((a) =>
        process.env[`STRIPE_LIVE_PORTAL_${a}`]?.startsWith("bpc_"),
      )
    );
  } catch {
    return false;
  }
}

export function liveIndividualBillingReady() {
  try {
    const plan = billingPlans("live").find((p) => p.audience === "individual");
    return (
      /^(sk|rk)_live_/.test(process.env.STRIPE_LIVE_SECRET_KEY || "") &&
      Boolean(process.env.STRIPE_LIVE_WEBHOOK_SECRET?.startsWith("whsec_")) &&
      Boolean(
        plan?.priceId.startsWith("price_") &&
        plan.productId.startsWith("prod_"),
      ) &&
      Boolean(process.env.STRIPE_LIVE_PORTAL_INDIVIDUAL?.startsWith("bpc_"))
    );
  } catch {
    return false;
  }
}
