import { z } from "zod";
import { premiumAdmin } from "@/lib/premium/providers";
import {
  requirePrivacyAccount,
  checkPrivacyRpc,
} from "@/lib/server/account-privacy";
import { apiError, assertSameOrigin, json, parseBody } from "@/lib/server/http";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const { user } = await requirePrivacyAccount();
    const r = await premiumAdmin().rpc("account_privacy_request", {
      p_user: user.id,
      p_action: "list",
    });
    checkPrivacyRpc(r.error);
    return json(r.data);
  } catch (error) {
    return apiError(error);
  }
}
const input = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("request"),
      kind: z.enum(["deletion", "information_copy"]),
      details: z.string().trim().max(2000).default(""),
      confirmation: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("withdraw"),
      id: z.uuid(),
      version: z.iso.datetime({ offset: true }),
    })
    .strict(),
]);
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await parseBody(request, input, 3500);
    const { user } = await requirePrivacyAccount();
    const r = await premiumAdmin().rpc("account_privacy_request", {
      p_user: user.id,
      p_action: body.action,
      ...(body.action === "request"
        ? { p_kind: body.kind, p_details: body.details }
        : { p_id: body.id, p_version: body.version }),
    });
    checkPrivacyRpc(r.error);
    return json(
      {
        request: r.data,
        message:
          body.action === "withdraw"
            ? "Privacy request withdrawn."
            : "Your request is recorded for Admin review. Follow its progress and response here. We respond within 30 days.",
      },
      body.action === "request" ? 201 : 200,
    );
  } catch (error) {
    return apiError(error);
  }
}
