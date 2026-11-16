import "server-only";
import { publicClient } from "./supabase/public";
import { demoJobs, type Job } from "./jobs";
import { getPublicJob, jobFromRecord } from "./jobs-server";
export type Company = {
  id: string;
  name: string;
  description: string;
  website: string | null;
  social_links?: Record<string, string>;
  is_verified: boolean;
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
  is_unresponsive: boolean;
  period_start: string;
  period_end: string;
  as_of: string;
};
const demoCompany = (j: Job): Company => ({
  id: j.id,
  name: j.company,
  description: j.companyDescription,
  website: null,
  is_verified: false,
  suspended_at: null,
  verified_at: null,
});
export async function getCompanies(page = 1) {
  const client = publicClient();
  if (!client)
    return {
      companies: demoJobs.slice((page - 1) * 12, page * 12).map(demoCompany),
      source: "demo" as const,
      total: demoJobs.length,
      error: undefined,
    };
  const { data, error, count } = await client
    .from("organisations")
    .select(
      "id,name,description,website,is_verified,suspended_at,verified_at,careers_email,avatar_path,banner_path,social_links",
      { count: "exact" },
    )
    .eq("is_verified", true)
    .is("suspended_at", null)
    .order("name")
    .order("id")
    .range((page - 1) * 12, page * 12 - 1);
  return {
    companies: (data ?? []) as Company[],
    source: "live" as const,
    total: count ?? 0,
    ...(error
      ? { error: "We couldn’t load employers just now. Please try again." }
      : {}),
  };
}
export async function getCompany(id: string): Promise<{
  company: Company | null;
  jobs: Job[];
  insight: Insight | null;
  source: "live" | "demo";
  error?: string;
}> {
  const client = publicClient();
  if (!client || id.startsWith("demo-")) {
    const j = demoJobs.find((j) => j.id === id);
    return {
      company: j ? demoCompany(j) : null,
      jobs: j ? [j] : [],
      insight: j
        ? {
            eligible_reports: j.eligibleReports,
            response_reports: j.responseReports,
            no_response_reports: j.noResponseReports,
            median_response_days: j.responseDays,
            is_unresponsive:
              j.eligibleReports >= 10 &&
              j.noResponseReports / j.eligibleReports > 0.5,
            period_start: "2026-05-15",
            period_end: "2026-08-15",
            as_of: "2026-11-15T00:00:00Z",
          }
        : null,
      source: "demo",
    };
  }
  if (!/^[0-9a-f-]{36}$/i.test(id))
    return { company: null, jobs: [], insight: null, source: "live" };
  let result = await client
    .from("organisations")
    .select(
      "id,name,description,website,is_verified,suspended_at,verified_at,careers_email,avatar_path,banner_path,social_links",
    )
    .eq("id", id)
    .maybeSingle();
  if (!result.data && !result.error) {
    const old = await getPublicJob(id);
    if (old.job?.organisationId)
      result = await client
        .from("organisations")
        .select(
          "id,name,description,website,is_verified,suspended_at,verified_at,careers_email,avatar_path,banner_path,social_links",
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
        "*,organisations(avatar_path,banner_path),listing_documents(id,filename,bytes)",
      )
      .eq("organisation_id", result.data.id)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(24),
    client
      .from("organisation_response_insights")
      .select(
        "*,organisations(avatar_path,banner_path),listing_documents(id,filename,bytes)",
      )
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
