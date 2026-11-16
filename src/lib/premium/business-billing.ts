import "server-only";
import { sandboxPlans, planFor } from "@/lib/billing-plans";
import { getSessionContext } from "@/lib/server/auth";
import { PremiumError } from "./http";
import { premiumAdmin, stripeClient } from "./providers";
import {
  assertBillingLeaseFresh,
  type BillingLease,
  withBillingLease,
} from "./billing";
export const businessPortal = {
  employer: "bpc_1UcN1rRX8vZXnntOspsuEXcq",
  agency: "bpc_1UcN1vRX8vZXnntOm2snZAKJ",
};
export async function billingScope(organisation?: string | null) {
  const context = await getSessionContext();
  if (!context.user || !context.supabase)
    throw new PremiumError(
      "SIGN_IN_REQUIRED",
      "Sign in to manage billing.",
      401,
    );
  if (!context.business)
    return {
      ...context,
      user: context.user,
      audience: "individual" as const,
      eligibleToPurchase: true,
      organisation: null,
    };
  const org = context.business.organisations.find((o) => o.id === organisation);
  if (!org || org.role !== "owner")
    throw new PremiumError(
      "BILLING_OWNER_REQUIRED",
      "Billing is private to the verified business owner. Choose a business you own.",
      403,
    );
  return {
    ...context,
    user: context.user,
    audience: context.business.kind,
    eligibleToPurchase: org.verified && !context.business.needsOnboarding,
    organisation: org,
  };
}
export async function businessCustomer(
  scope: Awaited<ReturnType<typeof billingScope>>,
  create = false,
  lease?: BillingLease,
) {
  if (!scope.organisation)
    throw new PremiumError("BUSINESS_REQUIRED", "Choose your business.");
  const admin = premiumAdmin();
  const id = scope.organisation.id;
  const { data, error } = await admin
    .from("organisation_billing_accounts")
    .select("stripe_customer_id,billing_user_id,audience")
    .eq("organisation_id", id)
    .maybeSingle();
  if (error)
    throw new PremiumError(
      "BILLING_UNAVAILABLE",
      "Billing is temporarily unavailable.",
      503,
    );
  if (data) {
    if (
      data.billing_user_id !== scope.user.id ||
      data.audience !== scope.audience
    )
      throw new PremiumError(
        "BILLING_OWNER_REQUIRED",
        "Only the billing owner may manage this subscription. A verified ownership transfer requires support review.",
        403,
      );
    return data.stripe_customer_id as string;
  }
  if (!create) return null;
  if (!lease || lease.userId !== scope.user.id)
    throw new PremiumError("BILLING_BUSY", "Please retry billing.", 409);
  assertBillingLeaseFresh(lease);
  const customer = await stripeClient().customers.create(
    {
      email: scope.user.email,
      name: scope.organisation.name,
      metadata: { westmere_organisation_id: id },
    },
    { idempotencyKey: `westmere-business-${id}` },
  );
  const saved = await admin.from("organisation_billing_accounts").insert({
    organisation_id: id,
    billing_user_id: scope.user.id,
    stripe_customer_id: customer.id,
    audience: scope.audience,
  });
  if (saved.error)
    throw new PremiumError(
      "BILLING_UNAVAILABLE",
      "Billing could not be saved. Please retry.",
      503,
    );
  return customer.id;
}
export async function validatedPlan(code: string, audience: string) {
  const plan = planFor(code);
  if (!plan || plan.audience !== audience)
    throw new PremiumError("INVALID_PLAN", "Choose a plan for this account.");
  const price = await stripeClient().prices.retrieve(plan.priceId);
  const product =
    typeof price.product === "string" ? price.product : price.product.id;
  if (
    price.livemode ||
    !price.active ||
    price.unit_amount !== plan.amount ||
    price.currency !== "aud" ||
    price.recurring?.interval !== "month" ||
    price.recurring.interval_count !== 1 ||
    product !== plan.productId
  )
    throw new PremiumError(
      "PRICE_CONFIGURATION",
      "This sandbox plan is not ready. No payment has been taken.",
      503,
    );
  return plan;
}
export async function reconcileBusinessCustomer(customer: string) {
  const admin = premiumAdmin();
  const { data: m, error } = await admin
    .from("organisation_billing_accounts")
    .select("organisation_id,billing_user_id,audience")
    .eq("stripe_customer_id", customer)
    .maybeSingle();
  if (error)
    throw new PremiumError(
      "BILLING_UNAVAILABLE",
      "Billing reconciliation is unavailable.",
      503,
    );
  if (!m) return false;
  return withBillingLease(m.billing_user_id, async (lease) => {
    await admin
      .from("organisation_billing_accounts")
      .update({ last_reconciliation_attempt_at: new Date().toISOString() })
      .eq("organisation_id", m.organisation_id);
    assertBillingLeaseFresh(lease);
    const list = await stripeClient().subscriptions.list({
      customer,
      status: "all",
      limit: 100,
    });
    if (list.has_more)
      throw new PremiumError(
        "BILLING_REVIEW_REQUIRED",
        "This billing account requires review.",
        503,
      );
    const matching = list.data.filter(
      (s) =>
        !s.livemode &&
        s.items.data.length === 1 &&
        sandboxPlans.some(
          (p) =>
            p.audience === m.audience &&
            p.priceId === s.items.data[0].price.id &&
            p.amount === s.items.data[0].price.unit_amount,
        ),
    );
    const active = matching.filter((s) =>
      ["active", "trialing"].includes(s.status),
    );
    const current = [...(active.length ? active : matching)].sort(
      (a, b) => b.created - a.created,
    )[0];
    const item = current?.items.data[0];
    const plan = sandboxPlans.find((p) => p.priceId === item?.price.id);
    assertBillingLeaseFresh(lease);
    const { error } = await admin.rpc("apply_business_subscription", {
      p_org: m.organisation_id,
      p_customer: customer,
      p_subscription: current?.id || null,
      p_price: plan?.priceId || null,
      p_tier: plan?.code || null,
      p_status: current?.status || "canceled",
      p_start: item
        ? new Date(item.current_period_start * 1000).toISOString()
        : null,
      p_end: item
        ? new Date(item.current_period_end * 1000).toISOString()
        : null,
      p_cancel: current?.cancel_at_period_end || false,
      p_user: m.billing_user_id,
      p_token: lease.token,
    });
    if (error)
      throw new PremiumError(
        "BILLING_UNAVAILABLE",
        "Billing reconciliation is unavailable.",
        503,
      );
    const done = await admin
      .from("organisation_billing_accounts")
      .update({ last_reconciled_at: new Date().toISOString() })
      .eq("organisation_id", m.organisation_id);
    if (done.error)
      throw new PremiumError(
        "BILLING_UNAVAILABLE",
        "Billing reconciliation is unavailable.",
        503,
      );
    return true;
  });
}
