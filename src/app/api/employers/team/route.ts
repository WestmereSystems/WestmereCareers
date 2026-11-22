import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import {
  ApiError,
  apiError,
  assertSameOrigin,
  json,
  parseBody,
} from "@/lib/server/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { supabase } = await requireSession();
    const { data, error } = await supabase.rpc("manage_business_team", {
      p_action: "list",
    });
    if (error) throw new ApiError(503, "Your team could not be loaded.");
    return json(data);
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await parseBody(
      request,
      z.union([
        z
          .object({
            action: z.literal("invite"),
            organisationId: z.uuid(),
            email: z.email().max(254),
          })
          .strict(),
        z
          .object({ action: z.literal("accept"), invitationId: z.uuid() })
          .strict(),
        z
          .object({
            action: z.literal("revoke"),
            organisationId: z.uuid(),
            invitationId: z.uuid(),
          })
          .strict(),
        z
          .object({
            action: z.literal("revoke"),
            organisationId: z.uuid(),
            memberId: z.uuid(),
          })
          .strict(),
      ]),
      2000,
    );
    const { supabase } = await requireSession();
    const { data, error } = await supabase.rpc("manage_business_team", {
      p_action: body.action,
      ...("organisationId" in body ? { p_org: body.organisationId } : {}),
      ...("email" in body ? { p_email: body.email } : {}),
      ...("invitationId" in body ? { p_invite: body.invitationId } : {}),
      ...("memberId" in body ? { p_member: body.memberId } : {}),
    });
    if (error)
      throw new ApiError(
        error.code === "42501" ? 403 : error.code === "23514" ? 409 : error.code === "22023" ? 400 : 503,
        ["42501", "22023", "23514"].includes(error.code)
          ? error.message
          : "The team change could not be saved. Please try again.",
      );
    return json({
      ...data,
      message:
        body.action === "invite"
          ? "Invitation queued for email delivery. It expires in seven days."
          : body.action === "accept"
            ? "You have joined the hiring team."
            : "Access revoked.",
    });
  } catch (error) {
    return apiError(error);
  }
}
