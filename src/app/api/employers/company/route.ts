import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import {
  ApiError,
  apiError,
  assertSameOrigin,
  json,
  parseBody,
} from "@/lib/server/http";
export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const { organisationId, businessName } = await parseBody(
      request,
      z
        .object({
          organisationId: z.uuid(),
          businessName: z.string().min(1).max(200),
        })
        .strict(),
      2000,
    );
    const { supabase } = await requireSession();
    const { error } = await supabase.rpc("remove_company", {
      p_org: organisationId,
      p_name: businessName,
    });
    if (error)
      throw new ApiError(error.code === "42501" ? 403 : 400, error.message);
    return json({
      message:
        "Company removed from public view. Listings are archived; application and audit records are retained.",
    });
  } catch (e) {
    return apiError(e);
  }
}
