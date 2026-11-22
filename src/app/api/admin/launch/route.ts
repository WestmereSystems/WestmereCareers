import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import {
  ApiError,
  apiError,
  assertSameOrigin,
  json,
  parseBody,
} from "@/lib/server/http";
import { checkRpc } from "@/lib/server/trust";
import {
  liveBusinessBillingReady,
  liveIndividualBillingReady,
} from "@/lib/premium/billing-mode";
const input = z
  .object({
    action: z.enum(["approve", "decline", "revoke", "release", "hide", "mode"]),
    id: z.uuid().optional(),
    kind: z.enum(["profile", "job"]).optional(),
    reason: z.string().trim().min(10).max(2000),
    open: z.boolean().default(false),
  })
  .strict()
  .superRefine((b, c) => {
    if (b.action !== "mode" && !b.id)
      c.addIssue({ code: "custom", message: "Choose an item.", path: ["id"] });
    if (["release", "hide"].includes(b.action) && !b.kind)
      c.addIssue({
        code: "custom",
        message: "Choose a content type.",
        path: ["kind"],
      });
  });
async function reviewer() {
  const session = await requireSession();
  const { data, error } = await session.supabase.rpc("my_staff_role");
  checkRpc(error);
  if (!["reviewer", "admin"].includes(data))
    throw new ApiError(403, "Reviewer access is required.");
  return session;
}
export async function GET(request: Request) {
  try {
    const offset = Number(new URL(request.url).searchParams.get("offset") || 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 10000)
      throw new ApiError(400, "Invalid request page.");
    const { supabase } = await reviewer();
    const { data, error } = await supabase.rpc("admin_launch", {
      p_action: "list",
      p_offset: offset,
    });
    checkRpc(error);
    return json(data);
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const b = await parseBody(request, input, 3000);
    const { supabase } = await reviewer();
    if (
      b.action === "mode" &&
      b.open &&
      (!liveBusinessBillingReady() || !liveIndividualBillingReady())
    )
      throw new ApiError(
        409,
        "Public launch is blocked until live employer, agency and Careers+ checkout and billing management are configured.",
      );
    const { error } = await supabase.rpc("admin_launch", {
      p_action: b.action,
      p_id: b.id || null,
      p_kind: b.kind || null,
      p_reason: b.reason,
      p_open: b.open,
    });
    if (error?.code === "22023")
      throw new ApiError(
        400,
        "Release requires an open public marketplace, a genuine verified business, the owner’s publication permission and an approved current vacancy. Check the item and record a reason.",
      );
    checkRpc(error);
    return json({
      message: "Launch decision saved.",
    });
  } catch (e) {
    return apiError(e);
  }
}
