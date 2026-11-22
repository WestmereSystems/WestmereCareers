import "server-only";
import { createHmac } from "node:crypto";
import { publicClient } from "@/lib/supabase/public";
import { createClient } from "@/lib/supabase/server";
import { premiumAdmin } from "@/lib/premium/providers";
import { ApiError } from "./http";

/** Missing configuration and failed reads keep the launch closed. No browser flag grants access. */
export async function marketplaceOpen(): Promise<boolean> {
  try {
    const db = publicClient();
    if (!db) return false;
    const { data, error } = await db.rpc("launch_status");
    return !error && data === true;
  } catch {
    return false;
  }
}
export async function assertLaunchSignIn(
  email: string,
  intent?: "employer" | "agency",
  request?: Request,
) {
  const open = await marketplaceOpen();
  const admin = premiumAdmin();
  if (!open && intent) {
    if (!request) throw new ApiError(400, "Start from business registration.");
    const prepared = await admin.rpc("prepare_business_signup", {
      p_email: email.trim().toLowerCase(),
      p_kind: intent,
      p_network: launchNetworkKey(request),
    });
    if (prepared.error)
      throw new ApiError(
        prepared.error.code === "P0001" ? 429 : 403,
        prepared.error.code === "P0001"
          ? "Please wait before requesting another business sign-in code."
          : "Business registration is unavailable for this account. Contact hello@westmere.com.au for help.",
        "FOUNDING_ACCESS_REQUIRED",
      );
  }
  const { data, error } = await admin.rpc("launch_signin_allowed", {
    p_email: email.trim().toLowerCase(),
  });
  if (error)
    throw new ApiError(
      503,
      "We couldn’t check founding access. Please try again.",
    );
  if (data !== true)
    throw new ApiError(
      403,
      "Applicant registration opens when Westmere Careers launches. Employers, agencies and approved accounts can use business sign in. For help, email hello@westmere.com.au.",
      "FOUNDING_ACCESS_REQUIRED",
    );
  return open || Boolean(intent);
}
export async function assertLaunchAccount(
  db: NonNullable<Awaited<ReturnType<typeof createClient>>>,
) {
  const { data, error } = await db.rpc("my_launch_access");
  if (error)
    throw new ApiError(503, "Your founding access could not be checked.");
  if (data?.allowed !== true)
    throw new ApiError(
      403,
      "Verify your email to continue. If this account’s access has been restricted, email hello@westmere.com.au.",
      "FOUNDING_ACCESS_REQUIRED",
    );
  return data as {
    allowed: boolean;
    kind: string | null;
    expiresAt: string | null;
    marketplaceOpen: boolean;
    applicantAllowed?: boolean;
  };
}
export async function assertStudioLaunchAccess() {
  if (await marketplaceOpen()) return;
  const db = await createClient();
  if (!db) throw new ApiError(503, "The Studio is being prepared.");
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    throw new ApiError(
      403,
      "The Studio is available to invited testers during our founding launch.",
    );
  await assertLaunchAccount(db);
}
export async function assertPurchasesOpen(audience = "individual") {
  if (!(await marketplaceOpen()) && !["employer", "agency"].includes(audience))
    throw new ApiError(
      403,
      "Careers+ subscriptions open with the public launch. Business and agency subscriptions are optional and require verification.",
      "LAUNCH_PURCHASES_CLOSED",
    );
}
export function launchNetworkKey(request: Request) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret)
    throw new ApiError(
      503,
      "Access requests are temporarily unavailable. Please contact hello@westmere.com.au.",
    );
  const ip = (
    request.headers.get("x-vercel-forwarded-for") ||
    request.headers.get("x-forwarded-for") ||
    "local"
  )
    .split(",")[0]
    .trim();
  return createHmac("sha256", secret).update(`launch:${ip}`).digest("hex");
}
