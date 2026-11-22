import "server-only";
import terms from "@/content/terms-and-conditions.json";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PremiumError } from "@/lib/premium/http";
import { ApiError } from "./http";
import type { BusinessSummary } from "@/lib/business";

export async function businessFor(
  supabase: SupabaseClient,
  userId: string,
  _testing?: { tier: string; startsAt: string; expiresAt: string } | null,
): Promise<BusinessSummary | null> {
  const [account, members, requests] = await Promise.all([
    supabase
      .from("business_accounts")
      .select("kind,trading_name,terms_version,default_organisation_id")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("organisation_members")
      .select(
        "organisation_id,role,organisations(name,is_verified,is_test,suspended_at,avatar_path,kind,agency_specialisms,agency_regions)",
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
  const shared = ids.length
    ? await supabase.rpc("my_business_team_tiers")
    : { data: [], error: null };
  if (shared.error)
    throw new ApiError(503, "Your business plan could not be checked.");
  const sharedTiers = (Array.isArray(shared.data) ? shared.data : []) as {
    id: string;
    tier: string | null;
  }[];
  const organisations = (members.data || [])
    .filter((m) => m.organisations)
    .map((m) => {
      const org = m.organisations as unknown as {
        name: string;
        kind?: "employer" | "agency";
        agency_specialisms?: string[];
        agency_regions?: string[];
        avatar_path?: string | null;
        is_verified: boolean;
        is_test?: boolean;
        suspended_at: string | null;
      };
      return {
        id: m.organisation_id,
        name: org.name,
        kind: org.kind || "employer",
        specialisms: org.agency_specialisms || [],
        regions: org.agency_regions || [],
        avatarPath: org.avatar_path,
        role: m.role,
        verified: org.is_verified && !org.suspended_at,
        isTest: org.is_test === true,
        tier:
          sharedTiers.find((team) => team.id === m.organisation_id)?.tier ??
          null,
      };
    });
  return {
    needsOnboarding: account.data?.terms_version !== terms.version,
    kind:
      organisations.find(
        (o) => o.id === account.data?.default_organisation_id && o.verified,
      )?.kind ||
      organisations.find((o) => o.role === "owner")?.kind ||
      (account.data?.kind === "agency" ? "agency" : "employer"),
    defaultOrganisationId:
      organisations.find(
        (o) => o.id === account.data?.default_organisation_id && o.verified,
      )?.id || null,
    tradingName:
      organisations.find(
        (o) => o.id === account.data?.default_organisation_id && o.verified,
      )?.name ||
      organisations.find((o) => o.verified)?.name ||
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
      "Use a personal account to access the Careers+ subscription and billing portal. Employer and agency accounts, including Enterprise, manage their business subscription in Profile → Billing.",
      403,
    );
}

// isPremium is resolved from the caller's own billing identity by getSessionContext.
export function assertCareerTools(
  business: BusinessSummary | null | undefined,
  isPremium: boolean,
) {
  if (business && !isPremium)
    throw new PremiumError(
      "ENTERPRISE_OR_PERSONAL_REQUIRED",
      "Use a personal Careers+ account or subscribe to Enterprise on this billing account to explore the candidate tools. Invited team accounts do not inherit Careers+.",
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
