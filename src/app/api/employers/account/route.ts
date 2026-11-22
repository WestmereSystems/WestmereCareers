import { withBillingLease } from "@/lib/premium/billing";
import { revokePersonalSubscription } from "@/lib/premium/convert-business";
import { premiumError } from "@/lib/premium/http";
import { createHash } from "node:crypto";
import { z } from "zod";
import terms from "@/content/terms-and-conditions.json";
import { requireSession } from "@/lib/server/auth";
import { premiumAdmin } from "@/lib/premium/providers";
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
    const body = await parseBody(
      request,
      z
        .object({
          kind: z.enum(["employer", "agency"]),
          tradingName: z.string().trim().min(2).max(180),
          businessEmail: z.email().max(254),
          termsAccepted: z.literal(true),
          conversionAccepted: z.boolean().default(false),
        })
        .strict(),
      2000,
    );
    const { user } = await requireSession();
    if (
      !user.email_confirmed_at ||
      user.email?.toLowerCase() !== body.businessEmail.toLowerCase()
    )
      throw new ApiError(
        400,
        "Sign in with the business email entered here before completing your business account.",
      );
    if (
      !user.last_sign_in_at ||
      Date.now() - Date.parse(user.last_sign_in_at) > 15 * 60_000
    )
      throw new ApiError(
        401,
        "Sign out and sign in again to confirm this account change. Business authority still requires independent verification.",
        "REAUTHENTICATION_REQUIRED",
      );
    const admin = premiumAdmin();
    const existing = await admin
      .from("business_accounts")
      .select("kind")
      .eq("user_id", user.id)
      .maybeSingle();
    if (existing.error)
      throw new ApiError(
        503,
        "Your business account type could not be checked.",
      );
    if (!existing.data && !body.conversionAccepted)
      throw new ApiError(
        409,
        "Confirm this permanent change: your Careers+ subscription will be cancelled immediately. Careers+ access on a business or agency account requires Enterprise or higher. This account cannot return to a standard applicant account.",
        "CONVERSION_CONFIRMATION_REQUIRED",
      );
    await withBillingLease(user.id, async (lease) => {
      if (!existing.data) await revokePersonalSubscription(user, lease);
      const { error } = await admin.rpc("complete_business_registration", {
        p_user: user.id,
        p_kind: existing.data?.kind || body.kind,
        p_name: body.tradingName,
        p_terms: terms.version,
        p_hash: createHash("sha256")
          .update(JSON.stringify(terms))
          .digest("hex"),
        p_confirmed: body.conversionAccepted || Boolean(existing.data),
      });
      if (error)
        throw new ApiError(
          503,
          "Your business account could not be completed. Please try again. Any personal subscription already cancelled will remain cancelled.",
        );
    });
    return json({ redirect: "/account?tab=verification" });
  } catch (e) {
    return e instanceof ApiError ? apiError(e) : premiumError(e);
  }
}
