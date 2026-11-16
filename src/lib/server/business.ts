import "server-only";
import terms from "@/content/terms-and-conditions.json";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PremiumError } from "@/lib/premium/http";
import { ApiError } from "./http";
import type { BusinessSummary } from "@/lib/business";

export async function businessFor(
  supabase: SupabaseClient,
  userId: string,
): Promise<BusinessSummary | null> {
  const [account, members, requests] = await Promise.all([
    supabase
      .from("business_accounts")
      .select("kind,trading_name,terms_version")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("organisation_members")
      .select(
        "organisation_id,role,organisations(name,is_verified,suspended_at)",
      )
      .eq("user_id", userId),
    supabase
      .from("employer_verification_requests")
      .select("status,business_name")
      .eq("applicant_id", userId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (account.error || members.error || requests.error)
    throw new ApiError(
      503,
      "Business account permissions could not be checked. Please try again.",
    );
  if (!account.data && !members.data?.length && !requests.data?.length)
    return null;
  const ids = (members.data || []).map((m) => m.organisation_id);
  const plans = ids.length
    ? await supabase
        .from("employer_plans")
        .select("organisation_id,tier")
        .in("organisation_id", ids)
        .lte("starts_at", new Date().toISOString())
        .gt("ends_at", new Date().toISOString())
    : { data: [], error: null };
  if (plans.error)
    throw new ApiError(503, "Your business plan could not be checked.");
  const organisations = (members.data || []).map((m) => {
    const org = m.organisations as unknown as {
      name: string;
      is_verified: boolean;
      suspended_at: string | null;
    };
    return {
      id: m.organisation_id,
      name: org.name,
      role: m.role,
      verified: org.is_verified && !org.suspended_at,
      tier:
        plans.data?.find((p) => p.organisation_id === m.organisation_id)
          ?.tier ?? null,
    };
  });
  return {
    needsOnboarding: account.data?.terms_version !== terms.version,
    kind: account.data?.kind === "agency" ? "agency" : "employer",
    tradingName:
      account.data?.trading_name ||
      organisations[0]?.name ||
      requests.data?.[0]?.business_name ||
      "Your business",
    verified: organisations.some((o) => o.verified),
    pending:
      requests.data?.[0]?.status === "pending" ||
      requests.data?.[0]?.status === "needs_information",
    tier: organisations.find((o) => o.tier)?.tier || null,
    organisations,
  };
}
export function assertIndividual(business: BusinessSummary | null | undefined) {
  if (business)
    throw new PremiumError(
      "INDIVIDUAL_ACCOUNT_REQUIRED",
      "Careers+ and candidate AI tools are for individual accounts. Use a separate personal account for your own career tools.",
      403,
    );
}

export function assertBusinessTerms(
  business: BusinessSummary | null | undefined,
) {
  if (!business || business.needsOnboarding)
    throw new ApiError(
      409,
      "Complete business onboarding and accept the current Terms at /employers/sign-in before using hiring tools.",
      "BUSINESS_ONBOARDING_REQUIRED",
    );
}
