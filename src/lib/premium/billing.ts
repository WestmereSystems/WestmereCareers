import "server-only";
import type Stripe from "stripe";
import { isCareersPrice, selectCurrentSubscription } from "./contracts";
import { PremiumError } from "./http";
import { careersPriceId, premiumAdmin, stripeClient } from "./providers";

export type BillingLease = { userId: string; token: string; deadline: number };

export function assertBillingLeaseFresh(lease: BillingLease) {
  // Conservative monotonic deadline measured from before the acquisition request.
  // Stripe mutations time out after 8s, leaving margin before the DB's 90s lease.
  if (performance.now() >= lease.deadline)
    throw new PremiumError(
      "BILLING_BUSY",
      "Your billing update timed out. Please try again shortly.",
      409,
    );
}

export async function withBillingLease<T>(
  userId: string,
  work: (lease: BillingLease) => Promise<T>,
): Promise<T> {
  const admin = premiumAdmin();
  const deadline = performance.now() + 50000;
  const { data: token, error } = await admin.rpc("acquire_billing_lease", {
    p_user_id: userId,
  });
  if (error)
    throw new PremiumError(
      "BILLING_UNAVAILABLE",
      "Billing is temporarily unavailable.",
      503,
    );
  if (typeof token !== "string")
    throw new PremiumError(
      "BILLING_BUSY",
      "Your billing account is being updated. Please try again shortly.",
      409,
    );
  try {
    const lease = { userId, token, deadline };
    assertBillingLeaseFresh(lease);
    return await work(lease);
  } finally {
    // Token-checked release cannot remove another worker's replacement lease.
    // A failed release is safe: the database expires the lease after 90 seconds.
    try {
      await admin.rpc("release_billing_lease", {
        p_user_id: userId,
        p_token: token,
      });
    } catch {
      /* Lease expiry provides recovery. */
    }
  }
}

export async function customerFor(
  user: { id: string; email?: string },
  create = false,
  lease?: BillingLease,
): Promise<string | null> {
  const admin = premiumAdmin();
  const { data: mapping, error } = await admin
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error)
    throw new PremiumError(
      "BILLING_UNAVAILABLE",
      "Your billing account is temporarily unavailable.",
      503,
    );
  if (mapping?.stripe_customer_id) return mapping.stripe_customer_id as string;
  if (!create) return null;
  if (!lease || lease.userId !== user.id)
    throw new PremiumError(
      "BILLING_UNAVAILABLE",
      "Your billing account is temporarily unavailable.",
      503,
    );
  assertBillingLeaseFresh(lease);
  const customer = await stripeClient().customers.create(
    { email: user.email, metadata: { westmere_user_id: user.id } },
    { idempotencyKey: `westmere-customer-${user.id}` },
  );
  // A concurrent request may have stored the same mapping first. Never replace a
  // trusted mapping with client input or an unrelated Stripe customer.
  const { error: insertError } = await admin
    .from("billing_customers")
    .upsert(
      { user_id: user.id, stripe_customer_id: customer.id },
      { onConflict: "user_id", ignoreDuplicates: true },
    );
  if (insertError)
    throw new PremiumError(
      "BILLING_UNAVAILABLE",
      "Your billing account is temporarily unavailable.",
      503,
    );
  const { data: saved, error: readError } = await admin
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .single();
  if (readError || !saved?.stripe_customer_id)
    throw new PremiumError(
      "BILLING_UNAVAILABLE",
      "Your billing account is temporarily unavailable.",
      503,
    );
  return saved.stripe_customer_id as string;
}

export async function validatedCareersPrice(stripe: Stripe) {
  const priceId = careersPriceId();
  const price = await stripe.prices.retrieve(priceId);
  if (
    !price.active ||
    !isCareersPrice(price, priceId) ||
    price.tax_behavior !== "inclusive"
  ) {
    throw new PremiumError(
      "PRICE_CONFIGURATION",
      "Careers+ billing is not ready yet. No payment has been taken.",
      503,
    );
  }
  return price;
}

export function stripeCustomerId(value: unknown): string | null {
  if (typeof value === "string" && value.startsWith("cus_")) return value;
  if (
    value &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string" &&
    value.id.startsWith("cus_")
  )
    return value.id;
  return null;
}

export async function reconcileCustomer(
  customerId: string,
  eventCreated: number,
) {
  const stripe = stripeClient();
  const admin = premiumAdmin();
  const priceId = careersPriceId();
  const { data: mapping, error } = await admin
    .from("billing_customers")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (error)
    throw new PremiumError(
      "BILLING_UNAVAILABLE",
      "Billing reconciliation is unavailable.",
      503,
    );
  // Unmapped Stripe customers are outside this application; never grant an
  // entitlement based on user-controllable event/customer metadata.
  if (!mapping) return false;
  return withBillingLease(mapping.user_id, async (lease) => {
    const { error: attemptError } = await admin
      .from("billing_customers")
      .update({ last_reconciliation_attempt_at: new Date().toISOString() })
      .eq("user_id", mapping.user_id);
    if (attemptError)
      throw new PremiumError(
        "BILLING_UNAVAILABLE",
        "Billing reconciliation is unavailable.",
        503,
      );
    // This read happens only after the per-user lease is held. Checkout, webhooks
    // and cron share the same lease, so their current-state snapshots serialize.
    assertBillingLeaseFresh(lease);
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
    });
    if (subscriptions.has_more)
      throw new PremiumError(
        "BILLING_REVIEW_REQUIRED",
        "This billing account requires review.",
        503,
      );
    const current = selectCurrentSubscription(subscriptions.data, priceId);
    if (!current) {
      const { data: existing, error: existingError } = await admin
        .from("subscriptions")
        .select("stripe_subscription_id")
        .eq("user_id", mapping.user_id)
        .maybeSingle();
      if (existingError)
        throw new PremiumError(
          "BILLING_UNAVAILABLE",
          "Billing reconciliation is unavailable.",
          503,
        );
      if (existing) {
        const { error: applyError } = await admin.rpc(
          "apply_subscription_state",
          {
            p_user_id: mapping.user_id,
            p_stripe_customer_id: customerId,
            p_stripe_subscription_id: existing.stripe_subscription_id,
            p_status: "canceled",
            p_price_id: null,
            p_current_period_start: null,
            p_current_period_end: null,
            p_cancel_at_period_end: false,
            p_event_created: eventCreated,
            p_lease_token: lease.token,
          },
        );
        if (applyError)
          throw new PremiumError(
            "BILLING_UNAVAILABLE",
            "Billing reconciliation is unavailable.",
            503,
          );
      }
    } else {
      const item = current.items.data[0];
      const { error: applyError } = await admin.rpc(
        "apply_subscription_state",
        {
          p_user_id: mapping.user_id,
          p_stripe_customer_id: customerId,
          p_stripe_subscription_id: current.id,
          p_status: current.status,
          p_price_id: item.price.id,
          p_current_period_start: new Date(
            item.current_period_start * 1000,
          ).toISOString(),
          p_current_period_end: new Date(
            item.current_period_end * 1000,
          ).toISOString(),
          p_cancel_at_period_end: current.cancel_at_period_end,
          p_event_created: eventCreated,
          p_lease_token: lease.token,
        },
      );
      if (applyError)
        throw new PremiumError(
          "BILLING_UNAVAILABLE",
          "Billing reconciliation is unavailable.",
          503,
        );
    }
    const { error: doneError } = await admin
      .from("billing_customers")
      .update({ last_reconciled_at: new Date().toISOString() })
      .eq("user_id", mapping.user_id);
    if (doneError)
      throw new PremiumError(
        "BILLING_UNAVAILABLE",
        "Billing reconciliation is unavailable.",
        503,
      );
    return true;
  });
}
