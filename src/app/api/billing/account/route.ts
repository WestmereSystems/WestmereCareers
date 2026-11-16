import { NextResponse } from "next/server";
import { z } from "zod";
import {
  billingScope,
  businessCustomer,
  businessPortal,
  validatedPlan,
} from "@/lib/premium/business-billing";
import {
  customerFor,
  withBillingLease,
  assertBillingLeaseFresh,
} from "@/lib/premium/billing";
import { stripeClient } from "@/lib/premium/providers";
import {
  boundedJson,
  premiumError,
  PremiumError,
  requireOrigin,
} from "@/lib/premium/http";
import { apiError, ApiError } from "@/lib/server/http";
import { sandboxPlans } from "@/lib/billing-plans";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const json = (data: unknown) =>
  NextResponse.json(data, {
    headers: { "Cache-Control": "private, no-store" },
  });
export async function GET(request: Request) {
  try {
    const scope = await billingScope(
      new URL(request.url).searchParams.get("organisation"),
    );
    const customer = scope.organisation
      ? await businessCustomer(scope)
      : await customerFor(scope.user);
    const base = {
      sandbox: true,
      audience: scope.audience,
      testing: scope.testingAccess || null,
      plans: sandboxPlans.filter((p) => p.audience === scope.audience),
      subscription: null,
      paymentMethod: null,
      invoices: [],
      hasCustomer: !!customer,
    };
    if (!customer) return json(base);
    const stripe = stripeClient();
    const [record, subscriptions, invoices] = await Promise.all([
      stripe.customers.retrieve(customer, {
        expand: ["invoice_settings.default_payment_method"],
      }),
      stripe.subscriptions.list({ customer, status: "all", limit: 100 }),
      stripe.invoices.list({ customer, limit: 20 }),
    ]);
    if (record.deleted || record.livemode || subscriptions.has_more)
      throw new PremiumError(
        "BILLING_REVIEW_REQUIRED",
        "This sandbox billing account needs review.",
        409,
      );
    const candidates = subscriptions.data.filter(
      (s) =>
        s.items.data.length === 1 &&
        base.plans.some((p) => p.priceId === s.items.data[0].price.id),
    );
    const s = candidates.sort(
      (a, b) =>
        Number(["active", "trialing"].includes(b.status)) -
          Number(["active", "trialing"].includes(a.status)) ||
        b.created - a.created,
    )[0];
    const method = record.invoice_settings.default_payment_method;
    return json({
      ...base,
      subscription: s
        ? {
            id: s.id,
            status: s.status,
            plan: sandboxPlans.find(
              (p) => p.priceId === s.items.data[0].price.id,
            )?.code,
            renewsAt: new Date(
              s.items.data[0].current_period_end * 1000,
            ).toISOString(),
            cancelAtPeriodEnd: s.cancel_at_period_end,
            scheduledChange: !!s.schedule,
          }
        : null,
      paymentMethod:
        method && typeof method !== "string" && method.card
          ? {
              brand: method.card.brand,
              last4: method.card.last4,
              expMonth: method.card.exp_month,
              expYear: method.card.exp_year,
            }
          : null,
      invoices: invoices.data.map((i) => ({
        id: i.id,
        number: i.number,
        status: i.status,
        total: i.total,
        currency: i.currency,
        date: i.created,
        url: i.hosted_invoice_url,
        pdf: i.invoice_pdf,
      })),
    });
  } catch (e) {
    return e instanceof ApiError ? apiError(e) : premiumError(e);
  }
}
export async function POST(request: Request) {
  try {
    const origin = requireOrigin(request);
    const parsed = z
      .object({
        organisation: z.uuid().nullable().optional(),
        action: z.enum(["checkout", "portal", "change"]),
        plan: z.string().max(40).optional(),
      })
      .strict()
      .safeParse(await boundedJson(request));
    if (!parsed.success)
      throw new PremiumError(
        "INVALID_REQUEST",
        "Choose a valid billing action and account.",
      );
    const b = parsed.data;
    const scope = await billingScope(b.organisation);
    if (b.action !== "portal" && !scope.eligibleToPurchase)
      throw new PremiumError(
        "VERIFICATION_REQUIRED",
        "Complete business verification and current business Terms before purchasing or changing a plan. Existing billing remains available for cancellation and payment management.",
        409,
      );
    const stripe = stripeClient();
    return await withBillingLease(scope.user.id, async (lease) => {
      const customer = scope.organisation
        ? await businessCustomer(scope, b.action === "checkout", lease)
        : await customerFor(scope.user, b.action === "checkout", lease);
      if (!customer)
        throw new PremiumError(
          "NO_BILLING_ACCOUNT",
          "Choose a subscription first.",
          404,
        );
      const returnUrl = `${origin}/account?tab=billing${scope.organisation ? `&organisation=${scope.organisation.id}` : ""}`;
      const subscriptions = await stripe.subscriptions.list({
        customer,
        status: "all",
        limit: 100,
      });
      if (subscriptions.has_more || subscriptions.data.some((s) => s.livemode))
        throw new PremiumError(
          "BILLING_REVIEW_REQUIRED",
          "This sandbox billing account needs review.",
          409,
        );
      const existing = subscriptions.data.filter(
        (s) => !["canceled", "incomplete_expired"].includes(s.status),
      );
      if (b.action === "portal" || b.action === "change") {
        const config =
          scope.audience === "individual" || !scope.eligibleToPurchase
            ? "bpc_1Uax45RX8vZXnntOsqutY8zk"
            : businessPortal[scope.audience];
        const flow: import("stripe").Stripe.BillingPortal.SessionCreateParams["flow_data"] =
          b.action === "change"
            ? await (async () => {
                const plan = await validatedPlan(b.plan || "", scope.audience);
                const s = existing[0];
                if (
                  existing.length !== 1 ||
                  !s ||
                  s.items.data.length !== 1 ||
                  !["active", "trialing"].includes(s.status) ||
                  s.schedule
                )
                  throw new PremiumError(
                    "CHANGE_UNAVAILABLE",
                    "Manage or cancel your scheduled change in Stripe before choosing another plan.",
                    409,
                  );
                const open = await stripe.invoices.list({
                  customer,
                  status: "open",
                  limit: 1,
                });
                if (open.data.length)
                  throw new PremiumError(
                    "PAYMENT_REQUIRED",
                    "Pay the outstanding invoice before changing plans.",
                    409,
                  );
                return {
                  type: "subscription_update_confirm" as const,
                  subscription_update_confirm: {
                    subscription: s.id,
                    items: [
                      {
                        id: s.items.data[0].id,
                        price: plan.priceId,
                        quantity: 1,
                      },
                    ],
                  },
                  after_completion: {
                    type: "redirect" as const,
                    redirect: { return_url: returnUrl },
                  },
                };
              })()
            : undefined;
        assertBillingLeaseFresh(lease);
        const session = await stripe.billingPortal.sessions.create({
          customer,
          configuration: config,
          return_url: returnUrl,
          locale: "en-AU",
          ...(flow ? { flow_data: flow } : {}),
        });
        return json({ url: session.url });
      }
      const plan = await validatedPlan(b.plan || "", scope.audience);
      if (existing.length)
        throw new PremiumError(
          "EXISTING_SUBSCRIPTION",
          "An existing subscription needs attention. Use Manage billing to avoid a duplicate charge.",
          409,
        );
      const open = await stripe.checkout.sessions.list({
        customer,
        status: "open",
        limit: 100,
      });
      if (open.has_more)
        throw new PremiumError(
          "BILLING_REVIEW_REQUIRED",
          "Please manage your existing checkout first.",
          409,
        );
      for (const item of open.data) {
        if (
          item.mode === "subscription" &&
          item.metadata?.westmere_price_id === plan.priceId &&
          item.url
        )
          return json({ url: item.url });
        if (item.mode === "subscription")
          await stripe.checkout.sessions.expire(item.id);
      }
      assertBillingLeaseFresh(lease);
      const window = Math.floor(Date.now() / 300000);
      const checkout = await stripe.checkout.sessions.create(
        {
          customer,
          mode: "subscription",
          line_items: [{ price: plan.priceId, quantity: 1 }],
          metadata: { westmere_price_id: plan.priceId },
          success_url: `${returnUrl}&checkout=complete`,
          cancel_url: `${returnUrl}&checkout=canceled`,
          expires_at: (window + 1) * 300 + 1860,
          custom_text: {
            submit: {
              message:
                "Sandbox test subscription only. No real money is charged. Monthly renewal until canceled; manage cancellation in Billing.",
            },
          },
        },
        { idempotencyKey: `wm-billing-${customer}-${plan.priceId}-${window}` },
      );
      if (!checkout.url)
        throw new PremiumError(
          "CHECKOUT_UNAVAILABLE",
          "Checkout is temporarily unavailable.",
          503,
        );
      return json({ url: checkout.url });
    });
  } catch (e) {
    return e instanceof ApiError ? apiError(e) : premiumError(e);
  }
}
