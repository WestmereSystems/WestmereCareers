import "server-only";
import { requireSession } from "./auth";
import { ApiError } from "./http";
export async function requireEmployer(
  organisationId: string,
  ownerOnly = false,
) {
  const c = await requireSession();
  const { data, error } = await c.supabase
    .from("organisation_members")
    .select("role,organisations(is_verified,suspended_at)")
    .eq("user_id", c.user.id)
    .eq("organisation_id", organisationId)
    .maybeSingle();
  const org = (
    Array.isArray(data?.organisations)
      ? data.organisations[0]
      : data?.organisations
  ) as { is_verified: boolean; suspended_at: string | null } | undefined;
  if (
    error ||
    !data ||
    !(
      ownerOnly ? ["owner", "admin"] : ["owner", "admin", "recruiter"]
    ).includes(data.role) ||
    !org?.is_verified ||
    org.suspended_at
  )
    throw new ApiError(
      403,
      "An active, verified hiring team permission is required.",
    );
  return c;
}
