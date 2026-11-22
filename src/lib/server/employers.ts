import "server-only";
import { assertBusinessTerms } from "./business";
import { requireSession } from "./auth";
import { ApiError } from "./http";
export async function requireEmployer(
  organisationId: string,
  ownerOnly = false,
  jobId?: string,
  action: "application" | "listing" = "application",
) {
  const c = await requireSession();
  assertBusinessTerms(c.business);
  const { data, error } = await c.supabase
    .from("organisation_members")
    .select("role,organisations(is_verified,suspended_at,kind)")
    .eq("user_id", c.user.id)
    .eq("organisation_id", organisationId)
    .maybeSingle();
  const org = (
    Array.isArray(data?.organisations)
      ? data.organisations[0]
      : data?.organisations
  ) as
    | { is_verified: boolean; suspended_at: string | null; kind?: string }
    | undefined;
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
  if (jobId) {
    const scope = await c.supabase.rpc("can_access_hiring_job", {
      p_job: jobId,
      p_action: action,
    });
    if (scope.error || scope.data !== true)
      throw new ApiError(
        403,
        "This vacancy is unavailable for your current assignment or client authorisation.",
      );
  } else if (org.kind === "agency" && data.role === "recruiter") {
    throw new ApiError(403, "Choose an assigned agency vacancy.");
  }
  return c;
}
