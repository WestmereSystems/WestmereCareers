import { describe, expect, it } from "vitest";
import { demoJobs, type Job } from "../src/lib/jobs";
import {
  cvMatch,
  filterJobs,
  formatSalary,
  jobSuggestions,
  locationSuggestions,
  parseJobQuery,
  serialiseJobQuery,
} from "../src/lib/search";

describe("candidate job search", () => {
  it("combines keyword, location and work mode without mutating the inventory", () => {
    const original = demoJobs.map((job) => job.id);
    const result = filterJobs(demoJobs, {
      keyword: "designer",
      location: "Melbourne, VIC",
      workMode: ["Hybrid"],
    });
    expect(result.map((job) => job.title)).toEqual(["Senior Product Designer"]);
    expect(demoJobs.map((job) => job.id)).toEqual(original);
  });

  it("keeps Australia-wide remote roles eligible in a local search", () => {
    expect(
      filterJobs(demoJobs, { location: "Perth" }).some(
        (job) => job.city === "Anywhere in Australia",
      ),
    ).toBe(true);
    expect(
      filterJobs(demoJobs, { location: "Perth", workMode: ["On-site"] }).every(
        (job) => job.city === "Perth",
      ),
    ).toBe(true);
  });

  it("does not guess annual pay from an hourly role", () => {
    const hourly = demoJobs.find((job) => job.salaryPeriod === "hour")!;
    const annual = {
      ...demoJobs[0],
      id: "annual",
      salaryMin: 70000,
      salaryMax: 80000,
    };
    const highHourly = {
      ...hourly,
      id: "hourly",
      salaryMin: 500,
      salaryMax: 600,
    };
    expect(
      filterJobs([highHourly, annual], { minSalary: 75000 }).map(
        (job) => job.id,
      ),
    ).toEqual(["annual"]);
    expect(
      filterJobs([highHourly, annual], { sort: "salary-high" }).map(
        (job) => job.id,
      ),
    ).toEqual(["annual", "hourly"]);
  });

  it("places employers without response data last and keeps ties stable", () => {
    const sample = demoJobs.slice(0, 3).map((job, index) => ({
      ...job,
      id: String(index),
      responseDays: index === 0 ? null : 4,
    }));
    expect(
      filterJobs(sample, { sort: "response-fast" }).map((job) => job.id),
    ).toEqual(["1", "2", "0"]);
  });

  it("sorts newest first and handles no-match queries", () => {
    const result = filterJobs([...demoJobs].reverse(), { sort: "newest" });
    expect(result[0].id).toBe("demo-fernbridge-designer");
    expect(filterJobs(demoJobs, { keyword: "unobtainium archivist" })).toEqual(
      [],
    );
  });

  it("suggests titles and locations with common typing mistakes", () => {
    expect(jobSuggestions("desginer")).toContain("Senior Product Designer");
    expect(jobSuggestions("front")).toContain("Frontend Engineer");
    expect(locationSuggestions("Melborne")).toContain("Melbourne, VIC");
    expect(locationSuggestions("syd")).toContain("Sydney, NSW");
    expect(jobSuggestions("zzzzzzzzzzzz")).toEqual([]);
    expect(locationSuggestions("").length).toBeLessThanOrEqual(6);
  });
});

describe("named CV skill overlap", () => {
  const job = {
    ...demoJobs[0],
    skills: ["React", "TypeScript", "CSS", "Testing", "Accessibility"],
  } satisfies Job;

  it("reports skills and gaps, not a hiring probability", () => {
    const result = cvMatch(
      job,
      "Built React interfaces with TypeScript and CSS.",
    );
    expect(result).toEqual({
      score: 0.6,
      matchedSkills: ["React", "TypeScript", "CSS"],
      missingSkills: ["Testing", "Accessibility"],
    });
    expect(
      filterJobs([job], {
        cvText: "React TypeScript CSS",
        strongMatchesOnly: true,
      }),
    ).toHaveLength(1);
    expect(
      filterJobs([job], { cvText: "React only", strongMatchesOnly: true }),
    ).toHaveLength(0);
  });

  it("uses word boundaries so unrelated words do not match", () => {
    expect(
      cvMatch(
        { ...job, skills: ["Java", "R", "SQL"] },
        "JavaScript, running and PostgreSQL",
      ).matchedSkills,
    ).toEqual([]);
    expect(cvMatch(job, "").score).toBe(0);
  });

  it("recognises documented aliases and handles no listed skills", () => {
    expect(cvMatch(job, "WCAG and Vitest").matchedSkills).toEqual([
      "Testing",
      "Accessibility",
    ]);
    expect(cvMatch({ ...job, skills: [] }, "React")).toEqual({
      score: 0,
      matchedSkills: [],
      missingSkills: [],
    });
  });
});

describe("salary labels", () => {
  it("preserves pay period and superannuation treatment", () => {
    expect(
      formatSalary({
        salaryMin: 90000,
        salaryMax: 110000,
        salaryPeriod: "year",
        superIncluded: false,
      }),
    ).toBe("A$90,000–110,000 + super");
    expect(
      formatSalary({
        salaryMin: 32,
        salaryMax: 37,
        salaryPeriod: "hour",
        superIncluded: true,
      }),
    ).toBe("A$32–37/hr incl. super");
    expect(
      formatSalary({
        salaryMin: 32.5,
        salaryMax: 37.75,
        salaryPeriod: "hour",
        superIncluded: false,
      }),
    ).toBe("A$32.50–37.75/hr + super");
  });
});

describe("search navigation state", () => {
  it("restores a fresh search when a cached bare /jobs URL replaces a local no-result search", () => {
    const localUrl = serialiseJobQuery({
      keyword: "zzzz-no-match",
      location: "Melbourne, VIC",
      workMode: ["Hybrid"],
      page: 1,
    });
    expect(
      filterJobs(demoJobs, parseJobQuery(new URLSearchParams(localUrl))),
    ).toHaveLength(0);
    const incomingNavigation = parseJobQuery(new URLSearchParams(""));
    expect(filterJobs(demoJobs, incomingNavigation)).toHaveLength(20);
    expect(incomingNavigation).toMatchObject({
      keyword: "",
      location: "",
      workMode: [],
      employmentType: [],
      minSalary: null,
      directOnly: false,
      sort: "relevance",
      page: 1,
    });
  });
  it("preserves multi-filter and pagination state through a browser URL round trip", () => {
    const query = serialiseJobQuery({
      keyword: "designer",
      location: "Melbourne, VIC",
      workMode: ["Hybrid", "Remote"],
      employmentType: ["Full time", "Contract"],
      minSalary: 100000,
      directOnly: true,
      sort: "salary-high",
      page: 2,
    });
    expect(parseJobQuery(new URLSearchParams(query))).toMatchObject({
      keyword: "designer",
      location: "Melbourne, VIC",
      workMode: ["Hybrid", "Remote"],
      employmentType: ["Full time", "Contract"],
      minSalary: 100000,
      directOnly: true,
      sort: "salary-high",
      page: 2,
    });
  });
  it("never serialises private CV text or private match state into browser history", () => {
    const query = serialiseJobQuery({
      keyword: "engineer",
      cvText: "PRIVATE CV AND CONTACT DETAILS",
      strongMatchesOnly: true,
      sort: "match",
      page: 1,
    });
    const params = new URLSearchParams(query);
    expect([...params.keys()]).toEqual(["q", "page"]);
    expect(query).not.toContain("PRIVATE");
  });
});
