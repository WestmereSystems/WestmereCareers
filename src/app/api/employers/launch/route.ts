import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import { apiError, assertSameOrigin, json, parseBody } from "@/lib/server/http";
import { checkRpc } from "@/lib/server/trust";
export async function GET() {
  try {
    const { supabase } = await requireSession();
    const { data, error } = await supabase.rpc("my_launch_content");
    checkRpc(error);
    return json(data);
  } catch (e) {
    return apiError(e);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const b = await parseBody(
      request,
      z
        .object({
          kind: z.enum(["profile", "job"]),
          id: z.uuid(),
          action: z.enum(["consent", "withdraw"]),
        })
        .strict(),
      1000,
    );
    const { supabase } = await requireSession();
    const { error } = await supabase.rpc("manage_launch_content", {
      p_kind: b.kind,
      p_id: b.id,
      p_action: b.action,
    });
    checkRpc(error);
    return json({
      message:
        b.action === "consent"
          ? "Permission saved. Westmere will review this content before releasing it publicly."
          : "Permission withdrawn. This content is private.",
    });
  } catch (e) {
    return apiError(e);
  }
}
