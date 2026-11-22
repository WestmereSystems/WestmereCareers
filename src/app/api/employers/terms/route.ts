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

// Renew consent for an existing account without changing its identity or type.
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await parseBody(
      request,
      z
        .object({
          termsAccepted: z.literal(true),
          termsVersion: z.literal(terms.version),
        })
        .strict(),
      500,
    );
    const { user, business } = await requireSession();
    if (!business || !user.email_confirmed_at)
      throw new ApiError(
        403,
        "Sign in to your verified business account first.",
      );
    const { data, error } = await premiumAdmin()
      .from("business_accounts")
      .update({
        terms_version: terms.version,
        terms_sha256: createHash("sha256")
          .update(JSON.stringify(terms))
          .digest("hex"),
        accepted_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .select("user_id")
      .maybeSingle();
    if (error)
      throw new ApiError(
        503,
        "Your Terms acceptance could not be saved. Please try again.",
      );
    if (!data)
      throw new ApiError(
        409,
        "Complete your business account setup before accepting updated Terms.",
      );
    return json({ message: "Your business Terms acceptance is up to date." });
  } catch (error) {
    return apiError(error);
  }
}
