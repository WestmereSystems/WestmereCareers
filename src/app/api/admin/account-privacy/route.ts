import { z } from "zod";
import { premiumAdmin } from "@/lib/premium/providers";
import {
  requirePrivacyAdministrator,
  checkPrivacyRpc,
} from "@/lib/server/account-privacy";
import {
  apiError,
  assertSameOrigin,
  json,
  parseBody,
  ApiError,
} from "@/lib/server/http";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const { user } = await requirePrivacyAdministrator();
    const params = new URL(request.url).searchParams;
    const offset = Number(params.get("offset") || 0);
    if (!Number.isInteger(offset) || offset < 0 || offset > 100000)
      throw new ApiError(400, "Choose an available request page.");
    const r = await premiumAdmin().rpc("admin_account_privacy", {
      p_actor: user.id,
      p_action: "list",
      p_offset: offset,
      p_all: params.get("all") === "1",
    });
    checkPrivacyRpc(r.error);
    return json(r.data);
  } catch (error) {
    return apiError(error);
  }
}
const input = z
  .object({
    id: z.uuid(),
    version: z.iso.datetime({ offset: true }),
    status: z.enum(["in_review", "completed", "declined"]),
    response: z.string().trim().min(10).max(6000),
  })
  .strict();
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await parseBody(request, input, 8000);
    const { user } = await requirePrivacyAdministrator();
    const r = await premiumAdmin().rpc("admin_account_privacy", {
      p_actor: user.id,
      p_action: "respond",
      p_id: body.id,
      p_version: body.version,
      p_status: body.status,
      p_response: body.response,
    });
    checkPrivacyRpc(r.error);
    return json({
      request: r.data,
      message:
        "Response recorded. This records the assessed outcome; it does not erase records or change a subscription.",
    });
  } catch (error) {
    return apiError(error);
  }
}
