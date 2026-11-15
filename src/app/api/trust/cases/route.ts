import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import { apiError, assertSameOrigin, json, parseBody } from "@/lib/server/http";
import { checkRpc } from "@/lib/server/trust";
const input = z
  .object({
    organisationId: z.uuid(),
    jobId: z.uuid().nullable().optional(),
    kind: z.enum(["listing_concern", "business_concern", "response_appeal"]),
    detail: z.string().trim().min(20).max(4000),
  })
  .strict();
export async function GET() {
  try {
    const { supabase, user } = await requireSession();
    const { data, error } = await supabase
      .from("moderation_cases")
      .select("*")
      .eq("requester_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    checkRpc(error);
    return json({ cases: data });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const b = await parseBody(request, input, 6000);
    const { supabase } = await requireSession();
    const { data, error } = await supabase.rpc("submit_moderation_case", {
      p_org: b.organisationId,
      p_job: b.jobId ?? null,
      p_kind: b.kind,
      p_detail: b.detail,
    });
    checkRpc(error);
    return json(
      {
        id: data,
        message:
          "Your concern is recorded privately. Follow the review in your trust activity.",
      },
      201,
    );
  } catch (error) {
    return apiError(error);
  }
}
