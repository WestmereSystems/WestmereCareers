import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import {
  apiError,
  ApiError,
  assertSameOrigin,
  json,
  parseBody,
} from "@/lib/server/http";
export async function GET() {
  try {
    const { supabase } = await requireSession();
    const { data, error } = await supabase.rpc("can_manage_testing");
    return json({ enabled: !error && data === true });
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { supabase } = await requireSession();
    const b = await parseBody(
      request,
      z
        .object({
          email: z.email().max(254),
          tier: z
            .enum([
              "careers_plus",
              "starter",
              "growth",
              "enterprise",
              "agency_starter",
              "agency_growth",
              "agency_enterprise",
            ])
            .nullable(),
          days: z.number().int().min(1).max(30),
          reason: z.string().trim().min(10).max(1000),
          designate: z.boolean(),
        })
        .strict(),
      2000,
    );
    const { error } = await supabase.rpc("manage_test_entitlement", {
      p_email: b.email,
      p_tier: b.tier,
      p_days: b.days,
      p_reason: b.reason,
      p_designate: b.designate,
    });
    if (error)
      throw new ApiError(error.code === "42501" ? 403 : 400, error.message);
    return json({
      message:
        "Test access updated. It is separate from payment records, expires automatically and grants no business verification.",
    });
  } catch (e) {
    return apiError(e);
  }
}
