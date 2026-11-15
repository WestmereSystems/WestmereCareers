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
const kind = z.enum([
  "verification",
  "job",
  "response_report",
  "case",
  "audit",
]);
const input = z
  .object({
    kind: z.enum([
      "verification",
      "job",
      "response_report",
      "case",
      "organisation",
    ]),
    id: z.uuid(),
    action: z.enum([
      "approve",
      "reject",
      "request_information",
      "quarantine",
      "accept",
      "review",
      "resolve",
      "dismiss",
      "suspend",
      "reinstate",
    ]),
    reason: z.string().trim().min(10).max(2000),
    version: z.iso.datetime({ offset: true }).nullable(),
    identityChecked: z.boolean().default(false),
    ownershipChecked: z.boolean().default(false),
  })
  .strict();
async function staffSession() {
  const session = await requireSession();
  const { data, error } = await session.supabase.rpc("my_staff_role");
  checkRpc(error);
  if (!["reviewer", "admin"].includes(data))
    throw new ApiError(403, "Independent reviewer access is required.");
  return session;
}
export async function GET(request: Request) {
  try {
    const { supabase } = await staffSession();
    const params = new URL(request.url).searchParams;
    const k = kind.safeParse(params.get("kind") || "verification");
    const at = params.get("after"),
      id = params.get("afterId");
    if (
      !k.success ||
      (at && !z.iso.datetime({ offset: true }).safeParse(at).success) ||
      (id && !z.uuid().safeParse(id).success) ||
      Boolean(at) !== Boolean(id)
    )
      throw new ApiError(400, "Invalid queue page.");
    const { data, error } = await supabase.rpc("admin_queue", {
      p_kind: k.data,
      p_after: at,
      p_after_id: id,
      p_all: params.get("all") === "1",
    });
    checkRpc(error);
    return json(data);
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const b = await parseBody(request, input, 6000);
    const { supabase } = await staffSession();
    const { data, error } = await supabase.rpc("review_trust_item", {
      p_kind: b.kind,
      p_id: b.id,
      p_action: b.action,
      p_reason: b.reason,
      p_version: b.version,
      p_identity_checked: b.identityChecked,
      p_ownership_checked: b.ownershipChecked,
    });
    checkRpc(error);
    return json({
      result: data,
      message: "Decision recorded in the review audit.",
    });
  } catch (error) {
    return apiError(error);
  }
}
