import { createClient } from "@/lib/supabase/server";
import { ApiError, apiError, assertSameOrigin, json } from "@/lib/server/http";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const supabase = await createClient();
    if (!supabase)
      throw new ApiError(
        503,
        "Account services are not configured yet.",
        "SERVICE_NOT_CONFIGURED",
      );
    const { error } = await supabase.auth.signOut();
    if (error)
      throw new ApiError(
        503,
        "We could not complete sign-out. Please try again.",
        "SIGN_OUT_FAILED",
      );
    return json({ message: "You are signed out." });
  } catch (error) {
    return apiError(error);
  }
}
