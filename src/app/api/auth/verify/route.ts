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
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await parseBody(
      request,
      z
        .object({
          email: z.email().max(254),
          code: z.string().regex(/^\d{6,8}$/),
          fullName: z.string().trim().min(1).max(120).optional(),
        })
        .strict(),
      2000,
    );
    const supabase = await createClient();
    if (!supabase) throw new ApiError(503, "Sign-in is being prepared.");
    const { data, error } = await supabase.auth.verifyOtp({
      email: body.email.trim().toLowerCase(),
      token: body.code,
      type: "email",
    });
    if (error || !data.user || !data.session)
      throw new ApiError(
        400,
        "That code could not be verified. Use the newest code or request another.",
      );
    if (body.fullName) {
      const existing = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", data.user.id)
        .maybeSingle();
      if (!existing.error && !existing.data?.full_name) {
        const saved = await supabase
          .from("profiles")
          .upsert({ id: data.user.id, full_name: body.fullName });
        if (saved.error)
          throw new ApiError(
            503,
            "You’re signed in. Please add your name on your profile.",
          );
      }
    }
    return json({ redirect: "/account" });
  } catch (e) {
    return apiError(e);
  }
}
