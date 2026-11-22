import { NextResponse } from "next/server";
import { z } from "zod";
import { premiumAdmin } from "@/lib/premium/providers";
import { apiError, ApiError, applicationOrigin } from "@/lib/server/http";
const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};
function token(request: Request) {
  const parsed = z
    .uuid()
    .safeParse(new URL(request.url).searchParams.get("token"));
  if (!parsed.success) throw new ApiError(400, "Invalid unsubscribe link.");
  return parsed.data;
}
export async function GET(request: Request) {
  try {
    return NextResponse.redirect(
      `${applicationOrigin(request)}/email-preferences?token=${token(request)}`,
      { status: 303, headers },
    );
  } catch (e) {
    return apiError(e);
  }
}
// Token capability supports standard one-click email unsubscription without a session.
export async function POST(request: Request) {
  try {
    const r = await premiumAdmin().rpc("unsubscribe_job_alert", {
      p_token: token(request),
    });
    if (r.error)
      throw new ApiError(503, "Email preferences could not be updated.");
    return new Response(
      "Job alerts for this saved search are now paused. You can manage your other searches in Westmere Careers.",
      { headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } },
    );
  } catch (e) {
    return apiError(e);
  }
}
