import { authOptions } from "@/lib/server/auth-options";
import { marketplaceOpen } from "@/lib/server/launch";
import {
  businessOAuthCookie,
  businessOAuthCookiePath,
  createBusinessOAuthIntent,
} from "@/lib/server/business-oauth";
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
    const { provider, intent } = await parseBody(
      request,
      z
        .object({
          provider: z.enum(["google", "azure"]),
          intent: z.enum(["employer", "agency"]).optional(),
          // Accept earlier clients without using their supplied email for OAuth.
          email: z.string().max(254).optional(),
        })
        .strict(),
      1000,
    );
    const open = await marketplaceOpen();
    if (!open) {
      if (!intent)
        throw new ApiError(
          403,
          "Applicant registration opens at public launch.",
          "FOUNDING_ACCESS_REQUIRED",
        );
    }
    if (!(await authOptions())[provider])
      throw new ApiError(
        503,
        "This provider is still being connected. Use an email code to continue.",
      );
    const businessFlow =
      !open && intent ? createBusinessOAuthIntent(intent, provider) : null;
    const supabase = await createClient();
    if (!supabase) throw new ApiError(503, "Sign-in is being prepared.");
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${applicationOrigin(request)}/auth/callback`,
        skipBrowserRedirect: true,
        ...(intent ? { queryParams: { prompt: "select_account" } } : {}),
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
    const response = json({ url: data.url });
    const store = response.cookies;
    if (businessFlow)
      store.set(businessOAuthCookie, businessFlow, {
        httpOnly: true,
        secure: new URL(request.url).protocol === "https:",
        sameSite: "lax",
        path: businessOAuthCookiePath,
        maxAge: 900,
      });
    if (intent)
      store.set("wm-business-intent", intent, {
        httpOnly: true,
        secure: new URL(request.url).protocol === "https:",
        sameSite: "lax",
        path: "/",
        maxAge: 900,
      });
    else store.delete("wm-business-intent");
    return response;
  } catch (e) {
    return apiError(e);
  }
}
