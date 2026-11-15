import { authOptions } from "@/lib/server/auth-options";
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
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { provider } = await parseBody(
      request,
      z.object({ provider: z.enum(["google", "azure"]) }).strict(),
      1000,
    );
    if (!(await authOptions())[provider])
      throw new ApiError(
        503,
        "This provider is still being connected. Use an email code to continue.",
      );
    const supabase = await createClient();
    if (!supabase) throw new ApiError(503, "Sign-in is being prepared.");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${applicationOrigin(request)}/auth/callback`,
        skipBrowserRedirect: true,
        ...(provider === "azure" ? { scopes: "email" } : {}),
      },
    });
    if (error || !data.url)
      throw new ApiError(
        503,
        "This sign-in provider is not available yet. Use an email code to continue.",
      );
    const url = new URL(data.url);
    const expected = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
    if (url.origin !== expected.origin || url.pathname !== "/auth/v1/authorize")
      throw new ApiError(503, "Sign-in is temporarily unavailable.");
    return json({ url: data.url });
  } catch (e) {
    return apiError(e);
  }
}
