import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import {
  apiError,
  ApiError,
  assertSameOrigin,
  json,
  parseBody,
} from "@/lib/server/http";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { organisationId } = await parseBody(
      request,
      z.object({ organisationId: z.uuid() }).strict(),
      1000,
    );
    const { supabase } = await requireSession();
    const { error } = await supabase.rpc("set_default_business", {
      p_org: organisationId,
    });
    if (error)
      throw new ApiError(
        error.code === "42501" ? 403 : 503,
        error.code === "42501"
          ? "Choose an active verified business you manage."
          : "Your default business could not be saved.",
      );
    return json({ message: "Your default business is updated." });
  } catch (error) {
    return apiError(error);
  }
}
