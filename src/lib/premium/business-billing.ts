import "server-only";
import { subscriptionTiming } from "./subscription-timing";
import { billingModeFor, billingPlans, type BillingMode } from "./billing-mode";
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
      mode: billingModeFor(context.user, "individual"),
      eligibleToPurchase: true,
      organisation: null,
    };
  const org = context.business.organisations.find((o) =>
    organisation ? o.id === organisation : o.role === "owner",
  );
  if (!org || org.role !== "owner")
    throw new PremiumError(
      "BILLING_OWNER_REQUIRED",
      "Billing is private to the verified business owner. Choose a business you own.",
      403,
    );
  return {
    ...context,
    user: context.user,
    audience: org.kind || context.business.kind,
    mode: billingModeFor(context.user, org.kind || context.business.kind),
    eligibleToPurchase:
      org.verified &&
      !context.business.needsOnboarding &&
      (!org.isTest ||
        billingModeFor(context.user, org.kind || context.business.kind) ===
          "test"),
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
    .select("stripe_customer_id,billing_user_id,audience,livemode")
    .eq("billing_user_id", scope.user.id)
    .eq("is_primary", true)
    .maybeSingle();
  if (error)
    throw new PremiumError(
      "BILLING_UNAVAILABLE",
      "Billing is temporarily unavailable.",
      503,
    );
  if (data && Boolean(data.livemode) === (scope.mode === "live")) {
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
  if (data) {
    const rotated = await admin.rpc("archive_sandbox_billing", {
      p_user: scope.user.id,
      p_token: lease.token,
    });
    if (rotated.error)
      throw new PremiumError(
        "BILLING_UNAVAILABLE",
        "Billing could not be prepared. Please retry.",
        503,
      );
  }
  const customer = await stripeClient(scope.mode).customers.create(
    {
      email: scope.user.email,
      name: scope.organisation.name,
      metadata: {
        westmere_organisation_id: id,
        westmere_billing_user_id: scope.user.id,
      },
    },
    {
      idempotencyKey: `westmere-business-account-${scope.mode}-${scope.user.id}`,
    },
  );
  const saved = await admin.from("organisation_billing_accounts").insert({
    organisation_id: id,
    billing_user_id: scope.user.id,
    stripe_customer_id: customer.id,
    audience: scope.audience,
    is_primary: true,
    livemode: scope.mode === "live",
  });
  if (saved.error)
    throw new PremiumError(
      "BILLING_UNAVAILABLE",
      "Billing could not be saved. Please retry.",
      503,
    );
  return customer.id;
}
export async function validatedPlan(
  code: string,
  audience: string,
  mode: BillingMode = "test",
) {
  const plan = billingPlans(mode).find((p) => p.code === code);
  if (!plan || plan.audience !== audience)
    throw new PremiumError("INVALID_PLAN", "Choose a plan for this account.");
  if (!plan.priceId || !plan.productId)
    throw new PremiumError(
      "NOT_CONFIGURED",
      "Business payments are being prepared. No payment has been taken.",
      503,
    );
  const price = await stripeClient(mode).prices.retrieve(plan.priceId);
  const product =
    typeof price.product === "string" ? price.product : price.product.id;
  if (
    price.livemode !== (mode === "live") ||
    !price.active ||
    price.unit_amount !== plan.amount ||
    price.currency !== "aud" ||
    price.recurring?.interval !== "month" ||
    price.recurring.interval_count !== 1 ||
    product !== plan.productId ||
    (mode === "live" && price.tax_behavior !== "inclusive")
  )
    throw new PremiumError(
      "PRICE_CONFIGURATION",
      "This plan is not ready. No payment has been taken.",
      503,
    );
  return plan;
}
export async function reconcileBusinessCustomer(
  customer: string,
  eventMode?: BillingMode,
) {
  const admin = premiumAdmin();
  const { data: m, error } = await admin
    .from("organisation_billing_accounts")
    .select("organisation_id,billing_user_id,audience,livemode,is_primary")
    .eq("stripe_customer_id", customer)
    .maybeSingle();
  if (error)
    throw new PremiumError(
      "BILLING_UNAVAILABLE",
      "Billing reconciliation is unavailable.",
      503,
    );
  if (!m || m.is_primary === false) return false;
  const mode: BillingMode = m.livemode ? "live" : "test";
  if (eventMode && eventMode !== mode)
    throw new PremiumError("WRONG_MODE", "Billing mode mismatch.", 400);
  const plans = billingPlans(mode);
  return withBillingLease(m.billing_user_id, async (lease) => {
    await admin
      .from("organisation_billing_accounts")
      .update({ last_reconciliation_attempt_at: new Date().toISOString() })
      .eq("stripe_customer_id", customer);
    assertBillingLeaseFresh(lease);
    const list = await stripeClient(mode).subscriptions.list({
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
    const transition = await admin.rpc("business_type_billing", {
      p_action: "pending",
      p_user: m.billing_user_id,
    });
    if (transition.error)
      throw new PremiumError(
        "BILLING_UNAVAILABLE",
        "Account-type reconciliation is unavailable.",
        503,
      );
    const pending = transition.data;
    if (pending?.billing_quote) {
      const q = pending.billing_quote;
      const confirmed = list.data.find(
        (s) =>
          s.id === q.subscriptionId &&
          s.livemode === (mode === "live") &&
          !s.pending_update &&
          s.status === "active" &&
          s.items.data.length === 1 &&
          s.items.data[0].price.id === q.priceId,
      );
      if (confirmed) {
        await validatedPlan(q.plan, pending.requested_kind, mode);
        const completed = await admin.rpc("business_type_billing", {
          p_action: "complete",
          p_id: pending.id,
          p_user: m.billing_user_id,
          p_details: { subscriptionId: confirmed.id, priceId: q.priceId },
        });
        if (completed.error)
          throw new PremiumError(
            "BILLING_UNAVAILABLE",
            "Your accepted account-type change is awaiting reconciliation. Please retry.",
            503,
          );
        m.audience = pending.requested_kind;
      }
    }
    const matching = list.data.filter(
      (s) =>
        s.livemode === (mode === "live") &&
        s.items.data.length === 1 &&
        plans.some(
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
    const timing = current && item ? subscriptionTiming(current, item) : null;
    const plan = plans.find((p) => p.priceId === item?.price.id);
    assertBillingLeaseFresh(lease);
    const { error } = await admin.rpc("apply_business_subscription", {
      p_org: m.organisation_id,
      p_customer: customer,
      p_subscription: current?.id || null,
      p_price: plan?.priceId || null,
      p_tier: plan?.code || null,
      p_status: current?.status || "canceled",
      p_start: timing?.start ?? null,
      p_end: timing?.end ?? null,
      p_cancel: timing?.cancelScheduled ?? false,
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
      .eq("stripe_customer_id", customer);
    if (done.error)
      throw new PremiumError(
        "BILLING_UNAVAILABLE",
        "Billing reconciliation is unavailable.",
        503,
      );
    return true;
  });
}
