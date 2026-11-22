import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ApiError } from "./http";
import { checkRpc } from "./trust";

/** Privacy access is limited to one's own verified account and does not admit an applicant. */
export async function requirePrivacyAccount() {
  const supabase = await createClient();
  if (!supabase) throw new ApiError(503, "Account services are unavailable.");
  const result = await supabase.auth.getUser();
  if (
    result.error &&
    result.error.name !== "AuthSessionMissingError" &&
    ![400, 401, 403].includes(result.error.status || 0)
  )
    throw new ApiError(
      503,
      "Account sign-in could not be checked. Please try again.",
    );
  if (result.error || !result.data.user)
    throw new ApiError(
      401,
      "Sign in to manage your account information.",
      "SIGN_IN_REQUIRED",
    );
  const user = result.data.user;
  if (!user.email || !user.email_confirmed_at)
    throw new ApiError(403, "Verify your account email first.");
  return { user, supabase };
}
export async function requirePrivacyAdministrator() {
  const context = await requirePrivacyAccount();
  const role = await context.supabase.rpc("my_staff_role");
  checkRpc(role.error);
  if (role.data !== "admin")
    throw new ApiError(403, "Administrator access is required.");
  return context;
}
export function checkPrivacyRpc(error: { code?: string } | null) {
  if (error?.code === "54000")
    throw new ApiError(
      413,
      "This account needs a larger information copy. Request a complete copy in Settings; no partial export was returned.",
      "EXPORT_REVIEW_REQUIRED",
    );
  if (error?.code === "P0001")
    throw new ApiError(
      429,
      "Please wait before making another request. Account downloads are available once every 15 minutes.",
      "PRIVACY_RATE_LIMIT",
    );
  checkRpc(error, "Your account information request could not be completed.");
}
