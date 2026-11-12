import { z } from "zod";
import { getSessionContext, requireSession } from "@/lib/server/auth";
import {
  ApiError,
  apiError,
  assertSameOrigin,
  json,
  parseBody,
} from "@/lib/server/http";

export const dynamic = "force-dynamic";
const input = z
  .object({
    fullName: z.string().trim().max(120).optional(),
    cvText: z.string().max(40_000).optional(),
  })
  .strict();

export async function GET() {
  try {
    const { supabase, user, isPremium } = await getSessionContext();
    let profile = null;
    if (supabase && user) {
      const result = await supabase
        .from("profiles")
        .select("full_name,cv_text,updated_at")
        .eq("id", user.id)
        .maybeSingle();
      if (result.error)
        throw new ApiError(
          503,
          "Your profile is temporarily unavailable.",
          "PROFILE_UNAVAILABLE",
        );
      profile = result.data;
    }
    return json({
      configured: Boolean(supabase),
      user: user ? { id: user.id, email: user.email } : null,
      isPremium,
      profile,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await parseBody(request, input);
    const { supabase, user } = await requireSession();
    const profile: Record<string, unknown> = {
      id: user.id,
      updated_at: new Date().toISOString(),
    };
    if (body.fullName !== undefined) profile.full_name = body.fullName;
    if (body.cvText !== undefined) profile.cv_text = body.cvText;
    const { error } = await supabase
      .from("profiles")
      .upsert(profile, { onConflict: "id" });
    if (error)
      throw new ApiError(
        503,
        "We could not save your profile. Please try again.",
        "PROFILE_SAVE_FAILED",
      );
    return json({ message: "Your profile has been saved." });
  } catch (error) {
    return apiError(error);
  }
}
