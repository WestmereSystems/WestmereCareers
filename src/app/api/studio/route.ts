import { assertIndividual } from "@/lib/server/business";
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/server/auth";
import { studioRequestSchema } from "@/lib/premium/contracts";
import {
  boundedJson,
  premiumError,
  PremiumError,
  requireOrigin,
} from "@/lib/premium/http";
import { openAIClient, premiumAdmin } from "@/lib/premium/providers";

import { generateStudioReview } from "@/lib/premium/studio-review";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const { supabase, user, isPremium, business } = await getSessionContext();
    if (!supabase)
      throw new PremiumError(
        "NOT_CONFIGURED",
        "The CV studio is being prepared. Your CV has not been sent anywhere.",
        503,
      );
    if (!user)
      throw new PremiumError(
        "SIGN_IN_REQUIRED",
        "Please sign in to use your CV studio.",
        401,
      );
    assertIndividual(business);
    if (!isPremium)
      throw new PremiumError(
        "PREMIUM_REQUIRED",
        "An active Careers+ subscription is required for this tool.",
        403,
      );
    const parsed = studioRequestSchema.safeParse(await boundedJson(request));
    if (!parsed.success)
      throw new PremiumError(
        "INVALID_REQUEST",
        parsed.error.issues[0]?.message ?? "Please check the supplied text.",
      );
    const client = openAIClient();
    const admin = premiumAdmin();
    const { data: reservation, error: reserveError } = await supabase.rpc(
      "reserve_ai_usage",
      { p_mode: parsed.data.mode },
    );
    if (reserveError || typeof reservation !== "string")
      throw new PremiumError(
        "USAGE_UNAVAILABLE",
        "Your monthly studio allowance is unavailable or has been used. Please check your subscription or try again later.",
        429,
      );
    let settled = false;
    try {
      const result = await generateStudioReview(client, parsed.data);
      const { error: settleError } = await admin.rpc("settle_ai_usage", {
        p_reservation_id: reservation,
        p_success: true,
      });
      if (settleError)
        throw new PremiumError(
          "USAGE_SETTLEMENT_PENDING",
          "Your review could not be saved safely. Please try again later.",
          503,
        );
      settled = true;
      return NextResponse.json(
        { result, reservationId: reservation },
        { headers: { "Cache-Control": "no-store" } },
      );
    } finally {
      if (!settled) {
        // This write is privileged: clients cannot refund their own successful usage.
        // A temporary DB failure also recovers through the reservation expiry policy.
        await admin.rpc("settle_ai_usage", {
          p_reservation_id: reservation,
          p_success: false,
        });
      }
    }
  } catch (error) {
    return premiumError(error);
  }
}
