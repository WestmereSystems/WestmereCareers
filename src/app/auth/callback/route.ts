import { assertLaunchAccount, assertLaunchSignIn } from "@/lib/server/launch";
import {
  businessOAuthCookie,
  businessOAuthCookiePath,
  readBusinessOAuthIntent,
} from "@/lib/server/business-oauth";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { applicationOrigin } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = applicationOrigin(request);
  const businessFlow = readBusinessOAuthIntent(request);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const flowId = url.searchParams.get("sb_flow_id");
  const emailToken =
    tokenHash &&
    url.searchParams.get("type") === "email" &&
    /^[a-zA-Z0-9_-]{20,512}$/.test(tokenHash) &&
    !code;
  const pkceCode =
    code &&
    code.length <= 2048 &&
    !tokenHash &&
    (!flowId || /^[a-zA-Z0-9_-]{16,128}$/.test(flowId));
  let signedIn = false;
  let accessDenied = false;
  try {
    if (emailToken || pkceCode) {
      const supabase = await createClient();
      if (supabase) {
        // Email token hashes work across browsers; retain PKCE for existing links/OAuth.
        const result = emailToken
          ? await supabase.auth.verifyOtp({
              token_hash: tokenHash!,
              type: "email",
            })
          : flowId
            ? await supabase.auth.exchangeCodeForSession(code!, { flowId })
            : await supabase.auth.exchangeCodeForSession(code!);
        signedIn = !result.error && Boolean(result.data.session);
        if (signedIn) {
          try {
            if (businessFlow && pkceCode) {
              const user = result.data.user;
              if (
                !user?.email ||
                !user.email_confirmed_at ||
                !user.identities?.some(
                  (identity) => identity.provider === businessFlow.provider,
                )
              )
                throw new Error("Verified provider identity required");
              // Only a verified provider email and a server-signed business
              // flow may admit a new identity to founding onboarding.
              await assertLaunchSignIn(user.email, businessFlow.kind, request);
            }
            await assertLaunchAccount(supabase);
          } catch {
            signedIn = false;
            accessDenied = true;
            await supabase.auth.signOut();
          }
        }
        if (result.error) {
          const errorCode = result.error.code;
          console.warn("Westmere sign-in callback failed", {
            code:
              errorCode && /^[a-z0-9_]{1,64}$/.test(errorCode)
                ? errorCode
                : "unknown",
          });
        }
      }
    }
  } catch {
    // Do not log URLs, bearer tokens, email addresses or raw provider messages.
    console.warn("Westmere sign-in callback unavailable");
  }
  const businessIntent = (request.headers.get("cookie") || "")
    .split(";")
    .map((c) => c.trim())
    .find(
      (c) =>
        c === "wm-business-intent=employer" ||
        c === "wm-business-intent=agency",
    );
  const businessKind =
    businessFlow?.kind ||
    (businessIntent
      ? businessIntent.endsWith("=agency")
        ? "agency"
        : "employer"
      : null);
  const destination = signedIn
    ? businessKind
      ? `/employers/sign-in?complete=1${businessKind === "agency" ? "&kind=agency" : ""}`
      : "/account"
    : accessDenied
      ? "/launch?access=required"
      : "/?auth=expired";
  const response = NextResponse.redirect(new URL(destination, origin), {
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
  response.cookies.delete("wm-business-intent");
  response.cookies.set(businessOAuthCookie, "", {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:",
    sameSite: "lax",
    path: businessOAuthCookiePath,
    maxAge: 0,
  });
  return response;
}
