import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { applicationOrigin, safeReturnPath } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = applicationOrigin(request);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const emailToken =
    tokenHash &&
    url.searchParams.get("type") === "email" &&
    /^[a-zA-Z0-9_-]{20,512}$/.test(tokenHash) &&
    !code;
  const pkceCode = code && code.length <= 2048 && !tokenHash;
  let signedIn = false;
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
          : await supabase.auth.exchangeCodeForSession(code!);
        signedIn = !result.error && Boolean(result.data.session);
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
  const destination = signedIn
    ? safeReturnPath(url.searchParams.get("next"))
    : "/?auth=expired";
  return NextResponse.redirect(new URL(destination, origin), {
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
