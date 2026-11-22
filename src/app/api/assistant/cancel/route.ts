import { cookies } from "next/headers";
import { z } from "zod";
import { getSessionContext } from "@/lib/server/auth";
import {
  assistantIdentity,
  guestCookie,
  readGuestToken,
} from "@/lib/server/assistant-identity";
import {
  assertSameOrigin,
  apiError,
  ApiError,
  parseBody,
  json,
} from "@/lib/server/http";
import { premiumAdmin } from "@/lib/premium/providers";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { attemptId } = await parseBody(
      request,
      z.object({ attemptId: z.uuid() }).strict(),
      1000,
    );
    const { user } = await getSessionContext();
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    const cookie = (await cookies()).get(guestCookie)?.value;
    if (!user && !readGuestToken(cookie, secret))
      throw new ApiError(401, "This request session has ended.");
    const identity = assistantIdentity(
      cookie,
      user?.id || null,
      request,
      secret,
    );
    const { data, error } = await premiumAdmin().rpc(
      "cancel_assistant_attempt",
      { p_attempt: attemptId, p_principal: identity.principal },
    );
    if (error || !["completed", "cancelled"].includes(data))
      throw new ApiError(
        503,
        "The stop action could not be confirmed. Please try again.",
      );
    return json({ status: data });
  } catch (error) {
    return apiError(error);
  }
}
