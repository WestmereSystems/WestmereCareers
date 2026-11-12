import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  ApiError,
  apiError,
  applicationOrigin,
  assertSameOrigin,
  json,
  parseBody,
} from "@/lib/server/http";

export const dynamic = "force-dynamic";
const input = z.object({ email: z.email().max(254) }).strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { email } = await parseBody(request, input, 2_000);
    const supabase = await createClient();
    if (!supabase)
      throw new ApiError(
        503,
        "Sign-in is being prepared. Please check back soon.",
        "SERVICE_NOT_CONFIGURED",
      );
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${applicationOrigin(request)}/auth/callback`,
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
    return json({ message: "Check your inbox for your secure sign-in link." });
  } catch (error) {
    return apiError(error);
  }
}
