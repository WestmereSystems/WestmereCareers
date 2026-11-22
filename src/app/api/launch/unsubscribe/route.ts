import { z } from "zod";
import { premiumAdmin } from "@/lib/premium/providers";
import { apiError, assertSameOrigin, json, parseBody } from "@/lib/server/http";
import { checkRpc } from "@/lib/server/trust";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const b = await parseBody(
      request,
      z.object({ token: z.uuid() }).strict(),
      200,
    );
    const r = await premiumAdmin().rpc("unsubscribe_launch", {
      p_token: b.token,
    });
    checkRpc(r.error);
    return json({
      message:
        "This address is unsubscribed from Westmere marketing emails. Essential account emails and separately requested saved-search alerts are unchanged.",
    });
  } catch (e) {
    return apiError(e);
  }
}
