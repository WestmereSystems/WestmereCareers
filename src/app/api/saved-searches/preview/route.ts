import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import { apiError, assertSameOrigin, json, parseBody } from "@/lib/server/http";
import { checkRpc } from "@/lib/server/trust";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const b = await parseBody(
      request,
      z.object({ id: z.uuid() }).strict(),
      1000,
    );
    const { supabase } = await requireSession();
    const { data, error } = await supabase.rpc("preview_search_alert", {
      p_search: b.id,
    });
    checkRpc(error);
    return json(
      {
        id: data,
        message:
          "Preview email queued for your verified account address. Delivery status appears below.",
      },
      202,
    );
  } catch (error) {
    return apiError(error);
  }
}
