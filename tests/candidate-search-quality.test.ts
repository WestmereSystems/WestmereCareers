import { expect, it } from "vitest";
import { cvMatch } from "../src/lib/search";
import { demoJobs } from "../src/lib/jobs";
import { savedSearchFilterCount } from "../src/lib/saved-search-filters";

it("optional experience can only add a smaller bonus and never remove a strong CV match", () => {
  const job = {
    ...demoJobs[0],
    skills: ["React", "TypeScript", "CSS", "Testing", "Accessibility"],
  };
  const base = cvMatch(job, "React TypeScript CSS");
  expect(base.score).toBe(0.6);
  expect(
    cvMatch(job, "React TypeScript CSS", "Completely unrelated details").score,
  ).toBe(base.score);
  expect(
    cvMatch(job, "React TypeScript CSS", "Testing Accessibility").score,
  ).toBe(0.7);
  expect(
    cvMatch(
      job,
      "Unrelated base CV",
      "React TypeScript CSS Testing Accessibility",
    ).score,
  ).toBe(0.25);
});
it("counts distinct, restrictive saved-search filters rather than radius or every checkbox", () => {
  expect(
    savedSearchFilterCount({
      keyword: "  ",
      distance: 250,
      workMode: ["Remote", "Hybrid", "On-site"],
      employmentType: ["Full time", "Part time", "Contract", "Casual"],
      minSalary: 0,
    }),
  ).toBe(0);
  expect(
    savedSearchFilterCount({
      keyword: "Designer",
      location: "Queanbeyan NSW",
      distance: 250,
    }),
  ).toBe(2);
  expect(
    savedSearchFilterCount({
      listedFrom: "2026-11-01",
      listedTo: "2026-11-21",
    }),
  ).toBe(1);
});
