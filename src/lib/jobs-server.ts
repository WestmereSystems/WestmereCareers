import { readListingLabels } from "./listing-copy";
import "server-only";
import { findPlace } from "./locations";
import { publicClient } from "@/lib/supabase/public";
import type { Job } from "./jobs";
import type { PublicJobQuery } from "./search";
export { parseJobQuery, type PublicJobQuery } from "./search";

export type PublicJobsResult = {
  jobs: Job[];
  source: "demo" | "live";
  total: number;
  page: number;
  pageSize: number;
  error?: string;
};
const columns =
  "advertiser_kind,client_label,recruitment_lead,is_test,content_labels,latitude,longitude,id,organisation_id,response_snapshot_at,title,company,category,location,city,state,work_mode,employment_type,salary_min,salary_max,salary_period,super_included,published_at,created_at,source,external_url,description,responsibilities,requirements,skills,tags,response_days,response_reports,no_response_reports,eligible_reports,company_size,company_description,contact_email,organisations(avatar_path,banner_path,is_verified,suspended_at,removed_at,is_test),listing_documents(id,filename,bytes)";
const strings = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
const text = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;
const number = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** Only public projections are mapped here. No private applicant or billing fields. */
export function jobFromRecord(row: Record<string, unknown>): Job {
  const company = text(row.company, "Employer");
  const business = (
    row.organisations && typeof row.organisations === "object"
      ? row.organisations
      : {}
  ) as Record<string, unknown>;
  const fresh =
    Date.parse(text(row.response_snapshot_at)) > Date.now() - 86400000;
  return {
    id: text(row.id),
    title: text(row.title),
    company,
    advertiserKind: row.advertiser_kind === "agency" ? "agency" : "employer",
    clientLabel: text(row.client_label) || undefined,
    recruitmentLead: text(row.recruitment_lead) || undefined,
    organisationId: text(row.organisation_id) || undefined,
    isVerified:
      business.is_verified === true &&
      !business.suspended_at &&
      !business.removed_at &&
      !business.is_test &&
      !row.is_test,
    isTest: row.is_test === true || business.is_test === true,
    companyInitial: company.slice(0, 1),
    category: text(row.category, "Other"),
    location: text(row.location),
    city: text(row.city),
    ...(typeof row.latitude === "number" && typeof row.longitude === "number"
      ? { latitude: row.latitude, longitude: row.longitude }
      : {}),
    state: text(row.state),
    workMode: ["Hybrid", "Remote", "On-site"].includes(text(row.work_mode))
      ? (row.work_mode as Job["workMode"])
      : "On-site",
    employmentType: ["Full time", "Part time", "Contract", "Casual"].includes(
      text(row.employment_type),
    )
      ? (row.employment_type as Job["employmentType"])
      : "Full time",
    salaryMin: row.salary_min == null ? null : number(row.salary_min),
    salaryMax: row.salary_max == null ? null : number(row.salary_max),
    contentLabels: readListingLabels(row.content_labels),
    salaryPeriod: row.salary_period === "hour" ? "hour" : "year",
    superIncluded: row.super_included === true,
    postedAt: text(row.published_at, text(row.created_at)),
    source: row.source === "external" ? "external" : "direct",
    ...(row.external_url ? { externalUrl: text(row.external_url) } : {}),
    contactEmail: text(row.contact_email) || undefined,
    avatarPath:
      text(
        (row.organisations as Record<string, unknown> | null)?.avatar_path,
      ) || undefined,
    bannerPath:
      text(
        (row.organisations as Record<string, unknown> | null)?.banner_path,
      ) || undefined,
    documents: Array.isArray(row.listing_documents)
      ? row.listing_documents.filter(
          (d): d is { id: string; filename: string; bytes: number } =>
            typeof d?.id === "string" &&
            typeof d?.filename === "string" &&
            typeof d?.bytes === "number",
        )
      : [],
    description: text(row.description),
    responsibilities: strings(row.responsibilities),
    requirements: strings(row.requirements),
    skills: strings(row.skills),
    tags: strings(row.tags),
    responseDays:
      fresh && typeof row.response_days === "number" ? row.response_days : null,
    responseReports: fresh ? number(row.response_reports) : 0,
    noResponseReports: fresh ? number(row.no_response_reports) : 0,
    eligibleReports: fresh ? number(row.eligible_reports) : 0,
    companySize: text(row.company_size),
    companyDescription: text(row.company_description),
  };
}

export async function getPublicJobs(
  filters: PublicJobQuery = {},
): Promise<PublicJobsResult> {
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const pageSize = Math.min(
    200,
    Math.max(1, Math.floor(filters.pageSize ?? 12)),
  );
  const base = { page, pageSize };
  try {
    const supabase = publicClient();
    if (!supabase)
      return {
        ...base,
        jobs: [],
        total: 0,
        source: "live",
        error: "Roles are temporarily unavailable. Please try again shortly.",
      };
    const now = new Date().toISOString();
    const origin = filters.distance ? findPlace(filters.location || "") : null;
    if (filters.distance && !origin)
      return {
        jobs: [],
        source: "live",
        total: 0,
        ...base,
        error:
          "Choose a city or town with its state from the suggestions to use a distance filter.",
      };
    let query = (
      origin && filters.distance
        ? supabase.rpc(
            "jobs_within_distance",
            {
              p_lat: origin.latitude,
              p_lon: origin.longitude,
              p_km: filters.distance,
            },
            { count: "exact" },
          )
        : supabase.from("jobs")
    )
      .select(columns, { count: "exact" })
      .eq("status", "published")
      .eq("is_test", false)
      .lte("published_at", now)
      .or(`expires_at.is.null,expires_at.gt.${now}`);
    if (filters.keyword?.trim())
      query = query.textSearch("search_vector", filters.keyword.slice(0, 120), {
        type: "websearch",
        config: "english",
      });
    if (filters.listedWithin)
      query = query.gte(
        "published_at",
        new Date(Date.now() - filters.listedWithin * 86400000).toISOString(),
      );
    if (filters.listedFrom)
      query = query.gte("published_at", `${filters.listedFrom}T00:00:00Z`);
    if (filters.listedTo)
      query = query.lt(
        "published_at",
        new Date(
          Date.parse(`${filters.listedTo}T00:00:00Z`) + 86400000,
        ).toISOString(),
      );
    if (filters.location?.trim() && !filters.distance) {
      const location = filters.location
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .trim()
        .replace(/\s+/g, " ");
      const stateOnly = /^(vic|nsw|qld|wa|sa|tas|act|nt)$/.test(location);
      const suffix = /\s+(vic|nsw|qld|wa|sa|tas|act|nt)$/.exec(location);
      const city = location.replace(/\s+(vic|nsw|qld|wa|sa|tas|act|nt)$/, "");
      if (stateOnly)
        query = query.or(
          `state.eq.${location.toUpperCase()},and(work_mode.eq.Remote,city.eq.Anywhere in Australia)`,
        );
      else if (city && city !== "anywhere in australia")
        query = query.or(
          `${suffix ? `and(city.ilike.%${city}%,state.eq.${suffix[1].toUpperCase()})` : `city.ilike.%${city}%`},and(work_mode.eq.Remote,city.eq.Anywhere in Australia)`,
        );
      else if (city === "anywhere in australia")
        query = query.eq("work_mode", "Remote");
    }
    if (filters.workMode?.length)
      query = query.in("work_mode", filters.workMode);
    if (filters.employmentType?.length)
      query = query.in("employment_type", filters.employmentType);
    if (filters.minSalary != null)
      query = query
        .eq("salary_period", "year")
        .gte("salary_max", filters.minSalary);
    if (filters.directOnly) query = query.eq("source", "direct");
    if (filters.sort === "salary-high")
      query = query
        .order("salary_period", { ascending: false })
        .order("salary_max", { ascending: false, nullsFirst: false });
    else if (filters.sort === "response-fast")
      query = query.order("response_days", {
        ascending: true,
        nullsFirst: false,
      });
    query = query
      .order("published_at", { ascending: false })
      .order("id", { ascending: true });
    const { data, error, count } = await query.range(
      (page - 1) * pageSize,
      page * pageSize - 1,
    );
    if (error)
      return {
        jobs: [],
        source: "live",
        total: 0,
        ...base,
        error: "We couldn’t load roles just now. Please try again shortly.",
      };
    return {
      jobs: (Array.isArray(data) ? data : []).map(jobFromRecord),
      source: "live",
      total: count ?? 0,
      ...base,
    };
  } catch {
    return {
      jobs: [],
      source: "live",
      total: 0,
      ...base,
      error: "We couldn’t load roles just now. Please try again shortly.",
    };
  }
}

/** Resolve device-saved identifiers without depending on a search page or inventory limit. */
export async function getPublicJobsByIds(requestedIds: string[]): Promise<{
  jobs: Job[];
  source: "demo" | "live";
  unavailableIds: string[];
  error?: string;
}> {
  const ids = [...new Set(requestedIds)].slice(0, 100);
  try {
    const supabase = publicClient();
    if (!supabase) {
      return {
        jobs: [],
        source: "live",
        unavailableIds: ids,
        error:
          "Saved roles are temporarily unavailable. Please try again shortly.",
      };
    }
    const valid = ids.filter((id) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      ),
    );
    if (!valid.length) return { jobs: [], source: "live", unavailableIds: ids };
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("jobs")
      .select(columns)
      .in("id", valid)
      .eq("status", "published")
      .eq("is_test", false)
      .lte("published_at", now)
      .or(`expires_at.is.null,expires_at.gt.${now}`);
    if (error)
      return {
        jobs: [],
        source: "live",
        unavailableIds: [],
        error: "We couldn’t load your saved roles just now. Please try again.",
      };
    const byId = new Map(
      (data ?? []).map((row) => {
        const job = jobFromRecord(row);
        return [job.id, job] as const;
      }),
    );
    return {
      jobs: ids
        .map((id) => byId.get(id))
        .filter((job): job is Job => Boolean(job)),
      source: "live",
      unavailableIds: ids.filter((id) => !byId.has(id)),
    };
  } catch {
    return {
      jobs: [],
      source: "live",
      unavailableIds: [],
      error: "We couldn’t load your saved roles just now. Please try again.",
    };
  }
}

export async function getPublicJob(
  id: string,
): Promise<{ job: Job | null; source: "demo" | "live"; error?: string }> {
  try {
    const supabase = publicClient();
    if (!supabase || id.startsWith("demo-"))
      return { job: null, source: "live" };
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        id,
      )
    )
      return { job: null, source: "live" };
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("jobs")
      .select(columns)
      .eq("id", id)
      .eq("is_test", false)
      .eq("status", "published")
      .lte("published_at", now)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .maybeSingle();
    if (error)
      return {
        job: null,
        source: "live",
        error:
          "This role is temporarily unavailable. Please try again shortly.",
      };
    return { job: data ? jobFromRecord(data) : null, source: "live" };
  } catch {
    return {
      job: null,
      source: "live",
      error: "This role is temporarily unavailable. Please try again shortly.",
    };
  }
}
