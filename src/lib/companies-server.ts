import "server-only";
import { companyIdFromPath } from "./company-urls";
import { publicClient } from "./supabase/public";
import type { Job } from "./jobs";
import { getPublicJob, jobFromRecord } from "./jobs-server";
export type Company = {
  id: string;
  name: string;
  kind?: "employer" | "agency";
  agency_specialisms?: string[];
  agency_regions?: string[];
  description: string;
  website: string | null;
  social_links?: Record<string, string>;
  is_verified: boolean;
  is_test?: boolean;
  suspended_at: string | null;
  verified_at: string | null;
  careers_email?: string | null;
  avatar_path?: string | null;
  banner_path?: string | null;
};
export type Insight = {
  eligible_reports: number | null;
  response_reports: number | null;
  no_response_reports: number | null;
  median_response_days: number | null;
  average_response_days?: number | null;
  is_unresponsive: boolean;
  period_start: string;
  period_end: string;
  as_of: string;
};
export async function getCompanies(
  page = 1,
  query = "",
  category = "",
  kind = "",
) {
  const q = typeof query === "string" ? query.trim().slice(0, 80) : "";
  const selectedCategory =
    typeof category === "string" ? category.trim().slice(0, 100) : "";
  const client = publicClient();
  if (!client)
    return {
      companies: [],
      source: "live" as const,
      total: 0,
      categories: [] as string[],
      error: "Employers are temporarily unavailable. Please try again shortly.",
    };
  let request = client
    .from("organisations")
    .select(
      selectedCategory
        ? "kind,agency_specialisms,agency_regions,is_test,id,name,description,website,is_verified,suspended_at,verified_at,careers_email,avatar_path,banner_path,social_links,jobs!inner(category)"
        : "kind,agency_specialisms,agency_regions,is_test,id,name,description,website,is_verified,suspended_at,verified_at,careers_email,avatar_path,banner_path,social_links",
      { count: "exact" },
    )
    .eq("is_verified", true)
    .eq("is_test", false)
    .is("suspended_at", null)
    .is("removed_at", null);
  if (["employer", "agency"].includes(kind)) request = request.eq("kind", kind);
  if (q) request = request.ilike("name", `%${q.replace(/[\\%_]/g, "\\$&")}%`);
  if (selectedCategory)
    request = request
      .eq("jobs.category", selectedCategory)
      .eq("jobs.status", "published")
      .lte("jobs.published_at", new Date().toISOString())
      .gt("jobs.expires_at", new Date().toISOString());
  const [{ data, error, count }, categories] = await Promise.all([
    request
      .order("name")
      .order("id")
      .range((page - 1) * 12, page * 12 - 1)
      .overrideTypes<Company[], { merge: false }>(),
    client.rpc("employer_role_categories"),
  ]);
  return {
    companies: (data ?? []) as Company[],
    source: "live" as const,
    total: count ?? 0,
    categories: (categories.data ?? []) as string[],
    ...(error || categories.error
      ? { error: "We couldn’t load employers just now. Please try again." }
      : {}),
  };
}
export async function getCompany(pathId: string): Promise<{
  company: Company | null;
  jobs: Job[];
  insight: Insight | null;
  source: "live" | "demo";
  error?: string;
}> {
  const id = companyIdFromPath(pathId);
  const client = publicClient();
  if (!client || id.startsWith("demo-"))
    return { company: null, jobs: [], insight: null, source: "live" };
  if (!/^[0-9a-f-]{36}$/i.test(id))
    return { company: null, jobs: [], insight: null, source: "live" };
  let result = await client
    .from("organisations")
    .select(
      "kind,agency_specialisms,agency_regions,is_test,id,name,description,website,is_verified,suspended_at,verified_at,careers_email,avatar_path,banner_path,social_links",
    )
    .eq("id", id)
    .eq("is_test", false)
    .maybeSingle();
  if (!result.data && !result.error) {
    const old = await getPublicJob(id);
    if (old.job?.organisationId)
      result = await client
        .from("organisations")
        .select(
          "kind,agency_specialisms,agency_regions,is_test,id,name,description,website,is_verified,suspended_at,verified_at,careers_email,avatar_path,banner_path,social_links",
        )
        .eq("id", old.job.organisationId)
        .maybeSingle();
  }
  if (result.error)
    return {
      company: null,
      jobs: [],
      insight: null,
      source: "live",
      error: "The employer profile is temporarily unavailable.",
    };
  if (!result.data)
    return { company: null, jobs: [], insight: null, source: "live" };
  const [roles, insights] = await Promise.all([
    client
      .from("jobs")
      .select(
        "*,organisations(avatar_path,banner_path,is_verified,suspended_at,removed_at,is_test),listing_documents(id,filename,bytes)",
      )
      .eq("organisation_id", result.data.id)
      .eq("status", "published")
      .lte("published_at", new Date().toISOString())
      .gt("expires_at", new Date().toISOString())
      .order("published_at", { ascending: false })
      .limit(24),
    client
      .from("organisation_response_insights")
      .select("*")
      .eq("organisation_id", result.data.id)
      .maybeSingle(),
  ]);
  const insight = insights.data as Insight | null;
  return {
    company: result.data as Company,
    jobs: (roles.data ?? []).map(jobFromRecord),
    insight:
      insight && Date.parse(insight.as_of) > Date.now() - 86400000
        ? insight
        : null,
    source: "live",
    ...(roles.error || insights.error
      ? {
          error:
            "Some profile information could not be loaded. Please refresh.",
        }
      : {}),
  };
}
