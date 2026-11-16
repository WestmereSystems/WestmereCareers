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
        })
        .strict(),
      2000,
    );
    const { user, isPremium } = await requireSession();
    if (
      !user.email_confirmed_at ||
      user.email?.toLowerCase() !== body.businessEmail.toLowerCase()
    )
      throw new ApiError(
        400,
        "Sign in with the business email entered here before completing your business account.",
      );
    if (isPremium)
      throw new ApiError(
        409,
        "This account has Careers+. Use a separate business account, or contact support before changing its account type.",
      );
    const { error } = await premiumAdmin()
      .from("business_accounts")
      .upsert({
        user_id: user.id,
        kind: body.kind,
        trading_name: body.tradingName,
        terms_version: terms.version,
        terms_sha256: createHash("sha256")
          .update(JSON.stringify(terms))
          .digest("hex"),
        accepted_at: new Date().toISOString(),
      });
    if (error)
      throw new ApiError(
        503,
        "Your business account could not be completed. Please try again.",
      );
    return json({ redirect: "/account?tab=verification" });
  } catch (e) {
    return apiError(e);
  }
}
