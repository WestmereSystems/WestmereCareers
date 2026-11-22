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

async function administrator() {
  const context = await requireSession();
  const role = await context.supabase.rpc("my_staff_role");
  checkRpc(role.error);
  if (role.data !== "admin")
    throw new ApiError(403, "Administrator access is required.");
  return context.supabase;
}
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const page = z
      .object({
        query: z.string().trim().max(254),
        offset: z.coerce.number().int().min(0).max(1000000).multipleOf(25),
      })
      .safeParse({
        query: params.get("q") || "",
        offset: params.get("offset") || 0,
      });
    if (!page.success) throw new ApiError(400, "Invalid list page.");
    const db = await administrator();
    const result = await db.rpc("admin_marketing_contacts", {
      p_action: "list",
      p_query: page.data.query,
      p_offset: page.data.offset,
    });
    checkRpc(result.error);
    return json(result.data);
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await parseBody(
      request,
      z
        .object({
          email: z.email().max(254),
          reason: z.string().trim().min(10).max(2000),
        })
        .strict(),
      3500,
    );
    const db = await administrator();
    const result = await db.rpc("admin_marketing_contacts", {
      p_action: "suppress",
      p_email: body.email.trim().toLowerCase(),
      p_reason: body.reason,
    });
    checkRpc(result.error);
    return json(result.data);
  } catch (error) {
    return apiError(error);
  }
}
