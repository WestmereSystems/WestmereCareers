import { NextResponse } from "next/server";
import { assertIndividual } from "@/lib/server/business";
import { getSessionContext } from "@/lib/server/auth";
import { customerFor } from "@/lib/premium/billing";
import { premiumError, PremiumError, requireOrigin } from "@/lib/premium/http";
import { stripeClient } from "@/lib/premium/providers";
import { billingModeFor, livePortal } from "@/lib/premium/billing-mode";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const origin = requireOrigin(request);
    const { supabase, user, business } = await getSessionContext();
    if (!supabase)
      throw new PremiumError(
        "NOT_CONFIGURED",
        "Billing is not available yet.",
        503,
      );
    if (!user)
      throw new PremiumError(
        "SIGN_IN_REQUIRED",
        "Please sign in to manage your billing.",
        401,
      );
    assertIndividual(business);
    const customer = await customerFor(user);
    if (!customer)
      throw new PremiumError(
        "NO_BILLING_ACCOUNT",
        "There is no subscription to manage yet.",
        404,
      );
    const mode = billingModeFor(user, "individual");
    const session = await stripeClient(mode).billingPortal.sessions.create({
      customer,
      ...(mode === "live" ? { configuration: livePortal("individual") } : {}),
      return_url: `${origin}/careers-plus`,
      locale: "en-AU",
    });
    return NextResponse.json(
      { url: session.url },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return premiumError(error);
  }
}
