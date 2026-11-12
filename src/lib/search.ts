import type { Job } from "./jobs";
import { demoJobs } from "./jobs";

export type JobSort =
  "relevance" | "newest" | "salary-high" | "response-fast" | "match";
export type JobFilters = {
  keyword?: string;
  location?: string;
  workMode?: string[];
  employmentType?: string[];
  minSalary?: number | null;
  sort?: JobSort;
  strongMatchesOnly?: boolean;
  directOnly?: boolean;
  cvText?: string;
};

export type PublicJobQuery = JobFilters & { page?: number; pageSize?: number };

export function parseJobQuery(params: URLSearchParams): PublicJobQuery {
  const clean = (key: string) => (params.get(key) ?? "").trim().slice(0, 120);
  const selected = (key: string, allow: string[]) =>
    params
      .getAll(key)
      .flatMap((value) => value.split(","))
      .filter((value) => allow.includes(value));
  const rawSalary = Number(params.get("minSalary"));
  const rawPage = Number(params.get("page"));
  const rawSort = clean("sort");
  return {
    keyword: clean("q"),
    location: clean("where"),
    workMode: selected("workMode", ["Hybrid", "Remote", "On-site"]),
    employmentType: selected("employmentType", [
      "Full time",
      "Part time",
      "Contract",
      "Casual",
    ]),
    minSalary:
      Number.isFinite(rawSalary) && rawSalary > 0
        ? Math.min(1000000, rawSalary)
        : null,
    directOnly: params.get("direct") === "1",
    sort: ["newest", "salary-high", "response-fast"].includes(rawSort)
      ? (rawSort as JobFilters["sort"])
      : "relevance",
    page:
      Number.isInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 5000) : 1,
    pageSize: 12,
  };
}

/** Serialise public filters only. Private CV text and consent never enter a URL. */
export function serialiseJobQuery(filters: PublicJobQuery): string {
  const params = new URLSearchParams();
  if (filters.keyword) params.set("q", filters.keyword);
  if (filters.location) params.set("where", filters.location);
  filters.workMode?.forEach((value) => params.append("workMode", value));
  filters.employmentType?.forEach((value) =>
    params.append("employmentType", value),
  );
  if (filters.minSalary) params.set("minSalary", String(filters.minSalary));
  if (filters.directOnly) params.set("direct", "1");
  if (filters.sort && filters.sort !== "relevance" && filters.sort !== "match")
    params.set("sort", filters.sort);
  params.set("page", String(filters.page ?? 1));
  return params.toString();
}

const normalise = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/c\+\+/g, "c plus plus")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const skillAliases: Record<string, string[]> = {
  "user research": ["ux research", "qualitative research"],
  testing: [
    "unit tests",
    "unit testing",
    "automated tests",
    "automated testing",
    "vitest",
    "jest",
  ],
  accessibility: ["wcag", "accessible design", "web accessibility"],
  communication: [
    "stakeholder communication",
    "written communication",
    "customer communication",
  ],
  javascript: ["javascript", "js"],
  typescript: ["typescript", "ts"],
  "node js": ["node", "nodejs", "node js"],
  "microsoft office": ["office 365", "microsoft 365", "ms office"],
  crm: ["salesforce", "hubspot", "customer relationship management"],
  "google analytics": ["ga4", "google analytics 4"],
  "point of sale": ["pos", "point of sale"],
};

/** Evidence of named skills only. The score is not a hiring probability or CV quality rating. */
export function cvMatch(job: Job, cvText: string) {
  const text = ` ${normalise(cvText)} `;
  const skills = [...new Set(job.skills)];
  const matchedSkills = skills.filter((skill) => {
    const key = normalise(skill);
    return [key, ...(skillAliases[key] ?? [])].some((alias) =>
      text.includes(` ${normalise(alias)} `),
    );
  });
  return {
    score: skills.length ? matchedSkills.length / skills.length : 0,
    matchedSkills,
    missingSkills: skills.filter((skill) => !matchedSkills.includes(skill)),
  };
}

const locationMatches = (job: Job, query: string) => {
  if (!query) return true;
  if (job.workMode === "Remote" && job.city === "Anywhere in Australia")
    return true;
  const match = /^(.*?)(?:\s+(vic|nsw|qld|sa|wa|tas|act|nt))?$/.exec(query);
  const city = match?.[1] || query;
  const state = match?.[2];
  const location = normalise(`${job.city} ${job.state}`);
  return (
    location.includes(query) ||
    (normalise(job.city).includes(city) &&
      (!state || normalise(job.state) === state))
  );
};

export function filterJobs(jobs: Job[], filters: JobFilters = {}): Job[] {
  const query = normalise(filters.keyword ?? "");
  const terms = query.split(" ").filter(Boolean);
  const location = normalise(filters.location ?? "");
  const scored = jobs.map((job, index) => ({
    job,
    index,
    match: cvMatch(job, filters.cvText ?? ""),
  }));
  const filtered = scored.filter(({ job, match }) => {
    const haystack = normalise(
      `${job.title} ${job.company} ${job.category} ${job.description} ${job.skills.join(" ")}`,
    );
    if (!terms.every((term) => haystack.includes(term))) return false;
    if (!locationMatches(job, location)) return false;
    if (filters.workMode?.length && !filters.workMode.includes(job.workMode))
      return false;
    if (
      filters.employmentType?.length &&
      !filters.employmentType.includes(job.employmentType)
    )
      return false;
    if (filters.directOnly && job.source !== "direct") return false;
    // Annual salary filters do not guess an annual income from an hourly rate.
    if (
      filters.minSalary != null &&
      (job.salaryPeriod !== "year" || job.salaryMax < filters.minSalary)
    )
      return false;
    if (filters.strongMatchesOnly && match.score < 0.6) return false;
    return true;
  });
  const relevance = (job: Job) => {
    const title = normalise(job.title);
    return query
      ? title === query
        ? 100
        : title.startsWith(query)
          ? 70
          : title.includes(query)
            ? 50
            : terms.reduce(
                (score, term) => score + (title.includes(term) ? 10 : 0),
                0,
              )
      : 0;
  };
  filtered.sort((a, b) => {
    let result = 0;
    switch (filters.sort) {
      case "newest":
        result = Date.parse(b.job.postedAt) - Date.parse(a.job.postedAt);
        break;
      case "salary-high":
        // Group annual and hourly pay rather than applying an unverified hours-per-year conversion.
        result =
          a.job.salaryPeriod === b.job.salaryPeriod
            ? b.job.salaryMax - a.job.salaryMax
            : a.job.salaryPeriod === "year"
              ? -1
              : 1;
        break;
      case "response-fast":
        result =
          (a.job.responseDays ?? Infinity) - (b.job.responseDays ?? Infinity);
        break;
      case "match":
        result = b.match.score - a.match.score;
        break;
      default:
        result = relevance(b.job) - relevance(a.job);
    }
    return Number.isNaN(result) || result === 0 ? a.index - b.index : result;
  });
  return filtered.map(({ job }) => job);
}

const titles = [
  ...new Set([
    ...demoJobs.map((job) => job.title),
    "Product Designer",
    "Software Engineer",
    "Customer Service Representative",
    "Project Coordinator",
    "Marketing Coordinator",
    "Accountant",
    "Receptionist",
    "Warehouse Assistant",
    "Sales Representative",
    "Early Childhood Educator",
    "Graphic Designer",
  ]),
];
const locations = [
  "Melbourne, VIC",
  "Sydney, NSW",
  "Brisbane, QLD",
  "Perth, WA",
  "Adelaide, SA",
  "Canberra, ACT",
  "Hobart, TAS",
  "Darwin, NT",
  "Geelong, VIC",
  "Newcastle, NSW",
  "Gold Coast, QLD",
  "Wollongong, NSW",
  "Ballarat, VIC",
  "Bendigo, VIC",
  "Cairns, QLD",
  "Anywhere in Australia",
];

const editDistance = (a: string, b: string) => {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++)
      row[j] = Math.min(
        row[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + Number(a[i - 1] !== b[j - 1]),
      );
    previous = row;
  }
  return previous[b.length];
};

function suggest(values: string[], value: string): string[] {
  const query = normalise(value);
  if (!query) return values.slice(0, 6);
  const tokens = query.split(" ");
  return values
    .map((value, index) => {
      const normal = normalise(value);
      const words = normal.split(" ");
      const fuzzy = tokens.every((token) =>
        words.some(
          (word) =>
            word.startsWith(token) ||
            (token.length >= 4 &&
              editDistance(token, word) <= (token.length >= 7 ? 2 : 1)),
        ),
      );
      return {
        value,
        index,
        score:
          normal === query
            ? 0
            : normal.startsWith(query)
              ? 1
              : normal.includes(query)
                ? 2
                : fuzzy
                  ? 3
                  : 99,
      };
    })
    .filter((item) => item.score < 99)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, 6)
    .map((item) => item.value);
}

export const jobSuggestions = (query: string) => suggest(titles, query);
export const locationSuggestions = (query: string) => suggest(locations, query);

export function formatSalary(
  job: Pick<Job, "salaryMin" | "salaryMax" | "salaryPeriod" | "superIncluded">,
): string {
  const hasCents =
    !Number.isInteger(job.salaryMin) || !Number.isInteger(job.salaryMax);
  const currency = new Intl.NumberFormat("en-AU", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `A$${currency.format(job.salaryMin)}–${currency.format(job.salaryMax)}${job.salaryPeriod === "hour" ? "/hr" : ""} ${job.superIncluded ? "incl. super" : "+ super"}`;
}
