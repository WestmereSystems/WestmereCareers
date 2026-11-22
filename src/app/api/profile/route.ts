import { z } from "zod";
import { profileLinksSchema, safeProfileLinks } from "@/lib/candidate-profile";
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
    fullName: z.string().trim().min(1, "Add your name.").max(120).optional(),
    firstName: z.string().trim().min(1).max(120).optional(),
    lastName: z.string().trim().max(120).optional(),
    socialLinks: profileLinksSchema.optional(),
    cvText: z.string().max(40_000).optional(),
    applicationEmailEnabled: z.boolean().optional(),
  })
  .strict();

export async function GET() {
  try {
    const { supabase, user, isPremium } = await getSessionContext();
    let profile = null;
    if (supabase && user) {
      const result = await supabase
        .from("profiles")
        .select(
          "full_name,first_name,last_name,social_links,cv_text,updated_at,active_cv_id,application_email_enabled",
        )
        .eq("id", user.id)
        .maybeSingle();
      if (result.error)
        throw new ApiError(
          503,
          "Your profile is temporarily unavailable.",
          "PROFILE_UNAVAILABLE",
        );
      profile = result.data
        ? {
            ...result.data,
            social_links: safeProfileLinks(result.data.social_links),
          }
        : null;
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
    if (body.fullName !== undefined) {
      profile.full_name = body.fullName;
      const [first, ...last] = body.fullName.split(/\s+/);
      profile.first_name = first;
      profile.last_name = last.join(" ");
    }
    if (body.firstName !== undefined || body.lastName !== undefined) {
      if (body.firstName === undefined || body.lastName === undefined)
        throw new ApiError(400, "Save both name fields together.");
      if (
        [body.firstName, body.lastName].filter(Boolean).join(" ").length > 120
      )
        throw new ApiError(
          400,
          "Please keep your full name within 120 characters.",
        );
      profile.first_name = body.firstName;
      profile.last_name = body.lastName;
      profile.full_name = [body.firstName, body.lastName]
        .filter(Boolean)
        .join(" ");
    }
    if (body.socialLinks !== undefined) profile.social_links = body.socialLinks;
    if (body.cvText !== undefined) profile.cv_text = body.cvText;
    if (body.applicationEmailEnabled !== undefined)
      profile.application_email_enabled = body.applicationEmailEnabled;
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
