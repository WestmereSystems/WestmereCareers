import "server-only";
import { createClient } from "@/lib/supabase/server";
import { demoJobs, type Job } from "./jobs";
import { filterJobs, type PublicJobQuery } from "./search";
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
  "id,title,company,category,location,city,state,work_mode,employment_type,salary_min,salary_max,salary_period,super_included,published_at,created_at,source,external_url,description,responsibilities,requirements,skills,tags,response_days,response_reports,no_response_reports,eligible_reports,company_size,company_description";
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
  return {
    id: text(row.id),
    title: text(row.title),
    company,
    companyInitial: company.slice(0, 1),
    category: text(row.category, "Other"),
    location: text(row.location),
    city: text(row.city),
    state: text(row.state),
    workMode: ["Hybrid", "Remote", "On-site"].includes(text(row.work_mode))
      ? (row.work_mode as Job["workMode"])
      : "On-site",
    employmentType: ["Full time", "Part time", "Contract", "Casual"].includes(
      text(row.employment_type),
    )
      ? (row.employment_type as Job["employmentType"])
      : "Full time",
    salaryMin: number(row.salary_min),
    salaryMax: number(row.salary_max),
    salaryPeriod: row.salary_period === "hour" ? "hour" : "year",
    superIncluded: row.super_included === true,
    postedAt: text(row.published_at, text(row.created_at)),
    source: row.source === "external" ? "external" : "direct",
    ...(row.external_url ? { externalUrl: text(row.external_url) } : {}),
    description: text(row.description),
    responsibilities: strings(row.responsibilities),
    requirements: strings(row.requirements),
    skills: strings(row.skills),
    tags: strings(row.tags),
    responseDays:
      typeof row.response_days === "number" ? row.response_days : null,
    responseReports: number(row.response_reports),
    noResponseReports: number(row.no_response_reports),
    eligibleReports: number(row.eligible_reports),
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
    const supabase = await createClient();
    if (!supabase) {
      const all = filterJobs(demoJobs, filters);
      return {
        jobs: all.slice((page - 1) * pageSize, page * pageSize),
        source: "demo",
        total: all.length,
        ...base,
      };
    }
    const now = new Date().toISOString();
    let query = supabase
      .from("jobs")
      .select(columns, { count: "exact" })
      .eq("status", "published")
      .lte("published_at", now)
      .or(`expires_at.is.null,expires_at.gt.${now}`);
    if (filters.keyword?.trim())
      query = query.textSearch("search_vector", filters.keyword.slice(0, 120), {
        type: "websearch",
        config: "english",
      });
    if (filters.location?.trim()) {
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
        .order("salary_max", { ascending: false });
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
      jobs: (data ?? []).map(jobFromRecord),
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
    const supabase = await createClient();
    if (!supabase) {
      const byId = new Map(demoJobs.map((job) => [job.id, job]));
      return {
        jobs: ids
          .map((id) => byId.get(id))
          .filter((job): job is Job => Boolean(job)),
        source: "demo",
        unavailableIds: ids.filter((id) => !byId.has(id)),
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
    const supabase = await createClient();
    if (!supabase)
      return {
        job: demoJobs.find((job) => job.id === id) ?? null,
        source: "demo",
      };
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
