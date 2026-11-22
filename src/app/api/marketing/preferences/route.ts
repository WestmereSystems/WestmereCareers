import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import { apiError, assertSameOrigin, json, parseBody } from "@/lib/server/http";
import { checkRpc } from "@/lib/server/trust";

export async function GET() {
  try {
    const { supabase } = await requireSession();
    const result = await supabase.rpc("my_marketing_preferences");
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
      z.object({ enabled: z.boolean() }).strict(),
      300,
    );
    const { supabase } = await requireSession();
    const result = await supabase.rpc("save_marketing_preferences", {
      p_enabled: body.enabled,
    });
    checkRpc(result.error);
    return json({
      ...result.data,
      message: body.enabled
        ? "Marketing emails are enabled. You can unsubscribe at any time."
        : "You’re unsubscribed from Westmere marketing emails.",
    });
  } catch (error) {
    return apiError(error);
  }
}
