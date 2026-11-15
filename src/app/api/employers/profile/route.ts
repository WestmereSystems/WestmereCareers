import { z } from "zod";
import { requireEmployer } from "@/lib/server/employers";
import { premiumAdmin } from "@/lib/premium/providers";
import {
  ApiError,
  apiError,
  assertSameOrigin,
  json,
  parseBody,
} from "@/lib/server/http";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await parseBody(
      request,
      z
        .object({
          organisationId: z.uuid(),
          description: z.string().trim().max(10000),
          careersEmail: z.union([z.email().max(254), z.literal("")]),
        })
        .strict(),
      20000,
    );
    await requireEmployer(body.organisationId, true);
    const { error } = await premiumAdmin()
      .from("organisations")
      .update({
        description: body.description,
        careers_email: body.careersEmail || null,
      })
      .eq("id", body.organisationId);
    if (error)
      throw new ApiError(503, "Your employer profile could not be updated.");
    return json({
      message:
        "Employer profile saved. Your careers email is public when supplied.",
    });
  } catch (e) {
    return apiError(e);
  }
}
