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
export const dynamic = "force-dynamic";
async function administrator() {
  const c = await requireSession();
  const r = await c.supabase.rpc("my_staff_role");
  checkRpc(r.error);
  if (r.data !== "admin")
    throw new ApiError(403, "Administrator access is required.");
  return c.supabase;
}
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const page = z
      .object({
        view: z.enum(["registrations", "mailing"]),
        offset: z.coerce.number().int().min(0).max(1000000).multipleOf(25),
      })
      .parse({
        view: params.get("view") || "registrations",
        offset: params.get("offset") || 0,
      });
    const db = await administrator();
    const r = await db.rpc("admin_launch_operations", {
      p_action: "list",
      p_view: page.view,
      p_offset: page.offset,
    });
    checkRpc(r.error);
    return json(r.data);
  } catch (e) {
    return apiError(
      e instanceof z.ZodError ? new ApiError(400, "Invalid list page.") : e,
    );
  }
}
const input = z
  .object({
    action: z.enum([
      "restrict",
      "restore",
      "remove_mail",
      "launch_and_email",
      "announce",
    ]),
    user: z.uuid().optional(),
    email: z.email().max(254).optional(),
    reason: z.string().trim().min(10).max(2000),
    confirmed: z.literal(true),
  })
  .strict()
  .superRefine((v, c) => {
    if (["restrict", "restore"].includes(v.action) && !v.user)
      c.addIssue({
        code: "custom",
        path: ["user"],
        message: "Choose an account.",
      });
    if (v.action === "remove_mail" && !v.email)
      c.addIssue({
        code: "custom",
        path: ["email"],
        message: "Choose a recipient.",
      });
  });
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const b = await parseBody(request, input, 3500);
    const db = await administrator();
    const r = await db.rpc("admin_launch_operations", {
      p_action: b.action,
      p_user: b.user || null,
      p_email: b.email || null,
      p_reason: b.reason,
    });
    checkRpc(r.error);
    return json(r.data);
  } catch (e) {
    return apiError(e);
  }
}
