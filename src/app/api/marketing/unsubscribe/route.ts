import { NextResponse } from "next/server";
import { z } from "zod";
import { premiumAdmin } from "@/lib/premium/providers";
import { ApiError, apiError, applicationOrigin } from "@/lib/server/http";

const privacyHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
};
function unsubscribeToken(request: Request) {
  const result = z
    .uuid()
    .safeParse(new URL(request.url).searchParams.get("token"));
  if (!result.success)
    throw new ApiError(
      400,
      "This unsubscribe link is incomplete. Open the button in your email again.",
    );
  return result.data;
}

// Reading a link never changes a preference: email security scanners follow GET links.
export async function GET(request: Request) {
  try {
    const token = unsubscribeToken(request);
    return NextResponse.redirect(
      `${applicationOrigin(request)}/marketing/unsubscribe?token=${token}`,
      { status: 303, headers: privacyHeaders },
    );
  } catch (error) {
    const response = apiError(error);
    for (const [key, value] of Object.entries(privacyHeaders))
      response.headers.set(key, value);
    return response;
  }
}

// The opaque token is the authority. No account, cookies, origin or additional personal data required.
// Also supports RFC 8058 mail clients posting List-Unsubscribe=One-Click to this endpoint.
export async function POST(request: Request) {
  try {
    const result = await premiumAdmin().rpc("unsubscribe_marketing", {
      p_token: unsubscribeToken(request),
    });
    if (result.error)
      throw new ApiError(
        result.error.code === "22023" ? 400 : 503,
        result.error.code === "22023"
          ? "This unsubscribe link could not be found. Please open the link in your original email."
          : "Your preference could not be saved. Please try again.",
      );
    return new Response(
      `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>You’re unsubscribed | Westmere Careers</title></head><body style="margin:0;background:#f4f5ef;color:#19382d;font:17px/1.65 system-ui,sans-serif"><main style="max-width:560px;margin:10vh auto;padding:32px"><p>WESTMERE CAREERS</p><h1>You’re unsubscribed.</h1><p>This email address will no longer receive Westmere marketing emails, including launch announcements and employer onboarding invitations.</p><p>Essential account emails and any saved-search alerts you separately requested are unchanged.</p><p>You can close this page. If you have an account, you can change your choice in Settings at any time.</p><a style="color:#19382d" href="/account?tab=settings#marketing">Account settings</a></main></body></html>`,
      {
        headers: {
          ...privacyHeaders,
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy":
            "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
        },
      },
    );
  } catch (error) {
    const response = apiError(error);
    for (const [key, value] of Object.entries(privacyHeaders))
      response.headers.set(key, value);
    return response;
  }
}
