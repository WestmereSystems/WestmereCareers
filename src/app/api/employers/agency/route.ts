import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import { assertBusinessTerms } from "@/lib/server/business";
import { apiError, assertSameOrigin, json, parseBody } from "@/lib/server/http";
import { checkRpc } from "@/lib/server/trust";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { supabase } = await requireSession();
    const p = new URL(request.url).searchParams;
    const review = p.get("review") === "1";
    const organisation = review ? null : z.uuid().parse(p.get("organisation"));
    const r = await supabase.rpc("manage_agency", {
      p_action: review ? "review_queue" : "list",
      p_org: organisation,
    });
    checkRpc(r.error);
    return json(r.data);
  } catch (e) {
    return apiError(e);
  }
}
const details = z
  .object({
    name: z.string().trim().min(2).max(180).optional(),
    publicLabel: z.string().trim().min(2).max(180).optional(),
    employerId: z.uuid().nullable().optional(),
    disclosed: z.boolean().optional(),
    representativeName: z.string().trim().min(2).max(180).optional(),
    representativeEmail: z.email().max(254).optional(),
    evidence: z.string().trim().min(30).max(6000).optional(),
    validFrom: z.iso.datetime({ offset: true }).optional(),
    validUntil: z.iso.datetime({ offset: true }).optional(),
    canOffer: z.boolean().optional(),
    canCommunicateDecisions: z.boolean().optional(),
    reason: z.string().trim().min(10).max(2000).optional(),
    version: z.string().max(100).optional(),
    decision: z.enum(["approve", "reject", "request_information"]).optional(),
    identityChecked: z.boolean().optional(),
    authorityChecked: z.boolean().optional(),
    offerAuthorityChecked: z.boolean().optional(),
    jobId: z.uuid().optional(),
    userId: z.uuid().optional(),
    enabled: z.boolean().optional(),
  })
  .strict();
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await parseBody(
      request,
      z
        .object({
          action: z.enum([
            "client_create",
            "request_authorisation",
            "client_approve",
            "revoke",
            "review",
            "assign",
            "unassign",
            "pilot",
          ]),
          organisationId: z.uuid().nullable().optional(),
          id: z.uuid().nullable().optional(),
          details: details.default({}),
        })
        .strict(),
      10000,
    );
    const { supabase, business } = await requireSession();
    if (!["review", "pilot"].includes(body.action))
      assertBusinessTerms(business);
    const r = await supabase.rpc("manage_agency", {
      p_action: body.action,
      p_org: body.organisationId ?? null,
      p_id: body.id ?? null,
      p_details: body.details,
    });
    checkRpc(r.error);
    return json({
      ...r.data,
      message: "Your agency workspace has been updated.",
    });
  } catch (e) {
    return apiError(e);
  }
}
