import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import {
  ApiError,
  apiError,
  assertSameOrigin,
  json,
  parseBody,
} from "@/lib/server/http";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { email } = await parseBody(
      request,
      z.object({ email: z.email().max(254) }).strict(),
      1000,
    );
    const { supabase, user } = await requireSession();
    if (email.toLowerCase() === user.email?.toLowerCase())
      throw new ApiError(400, "Choose a different email address.");
    const { error } = await supabase.auth.updateUser({
      email: email.trim().toLowerCase(),
    });
    if (error)
      throw new ApiError(
        error.status === 429 ? 429 : 400,
        "We could not request that change. Please wait and try again.",
      );
    return json({
      message:
        "Check both your current and new inboxes for confirmation codes. Your address changes only after both confirmations.",
    });
  } catch (e) {
    return apiError(e);
  }
}
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await parseBody(
      request,
      z
        .object({
          email: z.email().max(254),
          code: z.string().regex(/^\d{6,8}$/),
        })
        .strict(),
      1500,
    );
    const { supabase, user } = await requireSession();
    if (
      ![user.email?.toLowerCase(), user.new_email?.toLowerCase()]
        .filter(Boolean)
        .includes(body.email.trim().toLowerCase())
    )
      throw new ApiError(
        400,
        "Use your current address or the new address pending on this account.",
      );
    const { error } = await supabase.auth.verifyOtp({
      email: body.email.trim().toLowerCase(),
      token: body.code,
      type: "email_change",
    });
    if (error)
      throw new ApiError(
        400,
        "We couldn’t verify that code. Enter the address that received it and use its newest code.",
      );
    return json({
      message:
        "Code verified. Confirm the other inbox as well if requested, then refresh your account.",
    });
  } catch (e) {
    return apiError(e);
  }
}
