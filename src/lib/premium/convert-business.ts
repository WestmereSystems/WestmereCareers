import "server-only";
import {
  customerFor,
  assertBillingLeaseFresh,
  type BillingLease,
} from "./billing";
import { stripeClient } from "./providers";
import { PremiumError } from "./http";
import { billingModeFor } from "./billing-mode";

/** Stop personal renewals before the irreversible business conversion is committed. */
export async function revokePersonalSubscription(
  user: { id: string; email?: string },
  lease: BillingLease,
) {
  const customer = await customerFor(user);
  if (!customer) return;
  const mode = billingModeFor(user, "individual");
  const stripe = stripeClient(mode);
  const [subscriptions, checkouts] = await Promise.all([
    stripe.subscriptions.list({ customer, status: "all", limit: 100 }),
    stripe.checkout.sessions.list({ customer, status: "open", limit: 100 }),
  ]);
  if (subscriptions.has_more || checkouts.has_more)
    throw new PremiumError(
      "BILLING_REVIEW_REQUIRED",
      "Contact support to review your personal billing before converting this account.",
      409,
    );
  for (const checkout of checkouts.data) {
    if (checkout.mode === "subscription") {
      assertBillingLeaseFresh(lease);
      await stripe.checkout.sessions.expire(checkout.id);
    }
  }
  for (const subscription of subscriptions.data) {
    if (!["canceled", "incomplete_expired"].includes(subscription.status)) {
      if (subscription.livemode !== (mode === "live"))
        throw new PremiumError(
          "WRONG_MODE",
          "Your personal billing requires review.",
          409,
        );
      assertBillingLeaseFresh(lease);
      await stripe.subscriptions.cancel(subscription.id, {
        invoice_now: false,
        prorate: false,
      });
    }
  }
}
