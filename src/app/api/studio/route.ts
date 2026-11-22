import { assertCareerTools } from "@/lib/server/business";
import { getSessionContext } from "@/lib/server/auth";
import { studioRequestSchema } from "@/lib/premium/contracts";
import {
  boundedJson,
  premiumError,
  PremiumError,
  requireOrigin,
} from "@/lib/premium/http";
import { openAIClient } from "@/lib/premium/providers";

import { generateStudioReview } from "@/lib/premium/studio-review";
import {
  assistantAttemptId,
  assistantResponse,
} from "@/lib/premium/assistant-response";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    requireOrigin(request);
    assistantAttemptId(request);
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
    assertCareerTools(business, isPremium);
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
    return await assistantResponse(request, {
      reservation,
      paid: true,
      userId: user.id,
      generate: (signal, onPreview) =>
        generateStudioReview(client, parsed.data, signal, onPreview),
    });
  } catch (error) {
    return premiumError(error);
  }
}
