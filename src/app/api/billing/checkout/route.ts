import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/server/auth";
import {
  assertBillingLeaseFresh,
  customerFor,
  validatedCareersPrice,
  withBillingLease,
} from "@/lib/premium/billing";
import { premiumError, PremiumError, requireOrigin } from "@/lib/premium/http";
import { stripeClient } from "@/lib/premium/providers";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const origin = requireOrigin(request);
    const { supabase, user, isPremium } = await getSessionContext();
    if (!supabase)
      throw new PremiumError(
        "NOT_CONFIGURED",
        "Careers+ subscriptions are not available yet.",
        503,
      );
    if (!user)
      throw new PremiumError(
        "SIGN_IN_REQUIRED",
        "Please sign in before subscribing to Careers+.",
        401,
      );
    if (isPremium)
      throw new PremiumError(
        "ALREADY_SUBSCRIBED",
        "You already have Careers+. Manage it in your billing settings.",
        409,
      );
    const stripe = stripeClient();
    const price = await validatedCareersPrice(stripe);
    return await withBillingLease(user.id, async (lease) => {
      const customer = await customerFor(user, true, lease);
      if (!customer)
        throw new PremiumError(
          "BILLING_UNAVAILABLE",
          "Your billing account is temporarily unavailable.",
          503,
        );
      const subscriptions = await stripe.subscriptions.list({
        customer,
        status: "all",
        limit: 100,
      });
      if (subscriptions.has_more)
        throw new PremiumError(
          "BILLING_REVIEW_REQUIRED",
          "Please contact support to review this billing account.",
          409,
        );
      if (
        subscriptions.data.some(
          (s) =>
            [
              "active",
              "trialing",
              "past_due",
              "unpaid",
              "paused",
              "incomplete",
            ].includes(s.status) &&
            s.items.data.some((i) => i.price.id === price.id),
        )
      ) {
        throw new PremiumError(
          "EXISTING_SUBSCRIPTION",
          "An existing subscription needs attention. Please use Manage billing.",
          409,
        );
      }
      const open = await stripe.checkout.sessions.list({
        customer,
        status: "open",
        limit: 20,
      });
      const reusable = open.data.find(
        (s) =>
          s.mode === "subscription" &&
          s.metadata?.westmere_price_id === price.id &&
          s.url,
      );
      if (reusable?.url)
        return NextResponse.json(
          { url: reusable.url },
          { headers: { "Cache-Control": "no-store" } },
        );
      assertBillingLeaseFresh(lease);
      // Retries in one idempotency window must send identical Stripe parameters.
      const checkoutWindow = Math.floor(Date.now() / 300000);
      const session = await stripe.checkout.sessions.create(
        {
          customer,
          mode: "subscription",
          integration_identifier: "westmere_careers_klvobqoq",
          line_items: [{ price: price.id, quantity: 1 }],
          client_reference_id: user.id,
          metadata: { westmere_price_id: price.id },
          subscription_data: { metadata: { westmere_user_id: user.id } },
          success_url: `${origin}/careers-plus?checkout=complete`,
          cancel_url: `${origin}/careers-plus?checkout=canceled`,
          locale: "en",
          // Allow a minute for clock skew and the bounded provider request.
          expires_at: (checkoutWindow + 1) * 300 + 1860,
          custom_text: {
            submit: {
              message:
                "Careers+ costs A$25 per month and renews monthly until canceled. Cancel online in Manage billing.",
            },
          },
        },
        {
          idempotencyKey: `westmere-checkout-${user.id}-${price.id}-${checkoutWindow}`,
        },
      );
      if (!session.url)
        throw new PremiumError(
          "CHECKOUT_UNAVAILABLE",
          "Checkout is temporarily unavailable.",
          503,
        );
      return NextResponse.json(
        { url: session.url },
        { headers: { "Cache-Control": "no-store" } },
      );
    });
  } catch (error) {
    return premiumError(error);
  }
}
