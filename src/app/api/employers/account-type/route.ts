import { billingModeFor } from "@/lib/premium/billing-mode";
import { createHash } from "node:crypto";
import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import {
  apiError,
  ApiError,
  assertSameOrigin,
  json,
  parseBody,
} from "@/lib/server/http";
import { checkRpc } from "@/lib/server/trust";
import { premiumAdmin, stripeClient } from "@/lib/premium/providers";
import {
  withBillingLease,
  assertBillingLeaseFresh,
} from "@/lib/premium/billing";
import {
  validatedPlan,
  reconcileBusinessCustomer,
} from "@/lib/premium/business-billing";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET() {
  try {
    const { supabase } = await requireSession();
    const r = await supabase.rpc("manage_business_type", { p_action: "list" });
    checkRpc(r.error);
    return json(r.data);
  } catch (e) {
    return apiError(e);
  }
}
const input = z
  .object({
    action: z.enum(["request", "review", "cancel", "quote", "accept"]),
    id: z.uuid().nullable().optional(),
    details: z
      .object({
        kind: z.enum(["employer", "agency"]).optional(),
        evidence: z.string().trim().min(30).max(6000).optional(),
        specialisms: z
          .array(z.string().trim().min(2).max(100))
          .max(20)
          .optional(),
        regions: z.array(z.string().trim().min(2).max(100)).max(20).optional(),
        reason: z.string().trim().min(10).max(2000).optional(),
        version: z.string().max(100).optional(),
        decision: z
          .enum(["approve", "reject", "request_information"])
          .optional(),
        identityChecked: z.boolean().optional(),
        authorityChecked: z.boolean().optional(),
        plan: z.string().max(40).optional(),
        quoteHash: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
      })
      .strict()
      .default({}),
  })
  .strict();
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const b = await parseBody(request, input, 10000);
    const c = await requireSession();
    if (!["quote", "accept"].includes(b.action)) {
      const r = await c.supabase.rpc("manage_business_type", {
        p_action: b.action,
        p_id: b.id ?? null,
        p_details: b.details,
      });
      checkRpc(r.error);
      return json({
        ...r.data,
        message:
          "Account-type request updated. Approved identity and existing records remain protected during review.",
      });
    }
    if (!b.id) throw new ApiError(400, "Choose a reviewed correction.");
    const admin = premiumAdmin();
    const context = await admin.rpc("business_type_billing", {
      p_action: "context",
      p_id: b.id,
      p_user: c.user.id,
    });
    checkRpc(context.error);
    const correction = context.data;
    const billing = correction.billing;
    if (!billing?.stripe_customer_id)
      throw new ApiError(
        409,
        "This correction has no subscription requiring a billing transition.",
      );
    const result = await withBillingLease(c.user.id, async (lease) => {
      const mode = billingModeFor(c.user, correction.requested_kind);
      const stripe = stripeClient(mode);
      const all = await stripe.subscriptions.list({
        customer: billing.stripe_customer_id,
        status: "all",
        limit: 100,
      });
      const active = all.data.filter(
        (s) => !["canceled", "incomplete_expired"].includes(s.status),
      );
      if (
        all.has_more ||
        active.length !== 1 ||
        active[0].livemode !== (mode === "live") ||
        active[0].items.data.length !== 1
      )
        throw new ApiError(409, "This subscription requires billing review.");
      const sub = active[0],
        item = sub.items.data[0];
      if (
        sub.schedule ||
        sub.cancel_at_period_end ||
        sub.collection_method !== "charge_automatically" ||
        sub.status !== "active"
      )
        throw new ApiError(
          409,
          "Resolve scheduled changes or cancellation before accepting a type correction. Existing billing remains available.",
        );
      if (b.action === "quote") {
        const code =
          b.details.plan ||
          `${correction.requested_kind === "agency" ? "agency_" : ""}starter`;
        const plan = await validatedPlan(code, correction.requested_kind, mode);
        const date = Math.floor(Date.now() / 1000);
        const preview = await stripe.invoices.createPreview({
          customer: billing.stripe_customer_id,
          subscription: sub.id,
          subscription_details: {
            items: [{ id: item.id, price: plan.priceId, quantity: 1 }],
            proration_behavior: "always_invoice",
            proration_date: date,
          },
        });
        const quote = {
          subscriptionId: sub.id,
          itemId: item.id,
          oldPriceId: item.price.id,
          priceId: plan.priceId,
          plan: plan.code,
          planName: plan.name,
          monthlyAmount: plan.amount,
          amountDue: preview.amount_due,
          total: preview.total,
          currency: preview.currency,
          prorationDate: date,
          effectiveAt: new Date(date * 1000).toISOString(),
          billingCycleAnchor: sub.billing_cycle_anchor,
        };
        const hash = createHash("sha256")
          .update(JSON.stringify(quote))
          .digest("hex");
        const saved = await admin.rpc("business_type_billing", {
          p_action: "quote",
          p_id: b.id,
          p_user: c.user.id,
          p_details: { quote, hash },
        });
        checkRpc(saved.error);
        return {
          quote,
          quoteHash: hash,
          message:
            "Review and accept this subscription change. The customer, subscription and invoice history are retained.",
        };
      }
      const q = correction.billing_quote;
      if (
        correction.accepted_at &&
        q &&
        q.subscriptionId === sub.id &&
        item.price.id === q.priceId &&
        !sub.pending_update
      )
        return {
          message: "The accepted subscription change is being reconciled.",
        };
      if (
        !q ||
        q.subscriptionId !== sub.id ||
        q.oldPriceId !== item.price.id ||
        correction.quote_hash !== b.details.quoteHash ||
        Date.parse(correction.quote_expires_at) <= Date.now()
      )
        throw new ApiError(
          409,
          "The billing terms have changed or expired. Request a new preview.",
        );
      await validatedPlan(q.plan, correction.requested_kind, mode);
      if (!correction.accepted_at) {
        const preview = await stripe.invoices.createPreview({
          customer: billing.stripe_customer_id,
          subscription: sub.id,
          subscription_details: {
            items: [{ id: item.id, price: q.priceId, quantity: 1 }],
            proration_behavior: "always_invoice",
            proration_date: q.prorationDate,
          },
        });
        if (
          preview.total !== q.total ||
          preview.amount_due !== q.amountDue ||
          sub.billing_cycle_anchor !== q.billingCycleAnchor
        )
          throw new ApiError(
            409,
            "The billing terms have changed. Request a new preview before accepting.",
          );
      }
      const accepted = await c.supabase.rpc("manage_business_type", {
        p_action: "accept",
        p_id: b.id,
        p_details: { quoteHash: b.details.quoteHash },
      });
      checkRpc(accepted.error);
      assertBillingLeaseFresh(lease);
      const changed = await stripe.subscriptions.update(
        sub.id,
        {
          items: [{ id: item.id, price: q.priceId, quantity: 1 }],
          payment_behavior: "pending_if_incomplete",
          proration_behavior: "always_invoice",
          proration_date: q.prorationDate,
          expand: ["latest_invoice"],
        },
        { idempotencyKey: `westmere-type-${b.id}-${b.details.quoteHash}` },
      );
      const invoice = changed.latest_invoice;
      return {
        pending: !!changed.pending_update,
        paymentUrl:
          invoice && typeof invoice !== "string"
            ? invoice.hosted_invoice_url
            : null,
        message: changed.pending_update
          ? "Your accepted change is awaiting payment confirmation. Agency permissions remain locked until it completes."
          : "Your accepted subscription change is being reconciled.",
      };
    });
    if (b.action === "accept")
      await reconcileBusinessCustomer(billing.stripe_customer_id);
    return json(result);
  } catch (e) {
    return apiError(e);
  }
}
