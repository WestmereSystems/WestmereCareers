import { assertLaunchSignIn } from "@/lib/server/launch";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
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
    email: z.email().max(254),
    fullName: z.string().trim().min(1).max(120).optional(),
    intent: z.enum(["employer", "agency"]).optional(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { email, fullName, intent } = await parseBody(request, input, 2_000);
    const supabase = await createClient();
    if (!supabase)
      throw new ApiError(
        503,
        "Sign-in is being prepared. Please check back soon.",
        "SERVICE_NOT_CONFIGURED",
      );
    const shouldCreateUser = await assertLaunchSignIn(email, intent, request);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser,
        data: fullName ? { full_name: fullName } : undefined,
      },
    });
    if (error)
      throw new ApiError(
        error.status === 429 ? 429 : 503,
        error.status === 429
          ? "Please wait before requesting another sign-in email."
          : "We could not send your sign-in email. Please try again.",
        "SIGN_IN_EMAIL_UNAVAILABLE",
      );
    // Same response for existing and new accounts; Supabase handles email throttling.
    const response = json({
      message:
        "Check your inbox. The newest one-time sign-in code expires after 15 minutes.",
    });
    if (intent)
      response.cookies.set("wm-business-intent", intent, {
        httpOnly: true,
        secure: new URL(request.url).protocol === "https:",
        sameSite: "lax",
        path: "/",
        maxAge: 900,
      });
    else response.cookies.delete("wm-business-intent");
    return response;
  } catch (error) {
    return apiError(error);
  }
}
