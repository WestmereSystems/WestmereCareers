import { describe, expect, it } from "vitest";
import { companyIdFromPath, companyPath } from "../src/lib/company-urls";
import { findPlace, distanceKm } from "../src/lib/locations";
import {
  jobSuggestions,
  locationSuggestions,
  filterJobs,
  parseJobQuery,
  serialiseJobQuery,
} from "../src/lib/search";
import { demoJobs } from "../src/lib/jobs";
describe("launch search and company identity", () => {
  it("keeps identical company names distinct and resolves old and new identifiers", () => {
    const a = "20000000-0000-4000-8000-000000000001",
      b = "20000000-0000-4000-8000-000000000002";
    expect(companyPath("Same Company Pty Ltd", a)).not.toBe(
      companyPath("Same Company Pty Ltd", b),
    );
    expect(
      companyIdFromPath(companyPath("Café & Co", a).split("/").pop()!),
    ).toBe(a);
    expect(companyIdFromPath(a)).toBe(a);
    expect(
      companyIdFromPath(
        companyPath(demoJobs[0].company, demoJobs[0].id).split("/").pop()!,
      ),
    ).toBe(demoJobs[0].id);
  });
  it("offers real regional places and ABS occupations alongside curated suggestions", () => {
    expect(locationSuggestions("Warrnambool")).toContain("Warrnambool, VIC");
    expect(locationSuggestions("Alice Springs")).toContain("Alice Springs, NT");
    expect(jobSuggestions("Abalone Diver")).toContain("Abalone Diver");
    expect(jobSuggestions("")).toContain("Senior Product Designer");
  });
  it("requires state for ambiguous names and calculates locality-centre distance", () => {
    expect(findPlace("Richmond")).toBeNull();
    expect(findPlace("Richmond, VIC")?.state).toBe("VIC");
    const melbourne = findPlace("Melbourne, VIC")!,
      geelong = findPlace("Geelong, VIC")!;
    expect(distanceKm(melbourne, geelong)).toBeGreaterThan(60);
    expect(distanceKm(melbourne, geelong)).toBeLessThan(80);
  });
  it("combines radius and precise listing windows and round-trips the public URL", () => {
    const now = Date.now();
    const base = {
      ...demoJobs[0],
      postedAt: new Date(now - 86400000).toISOString(),
    };
    const nearby = { ...base, id: "near", city: "Geelong", state: "VIC" };
    const far = { ...base, id: "far", city: "Sydney", state: "NSW" };
    const old = {
      ...nearby,
      id: "old",
      postedAt: new Date(now - 10 * 86400000).toISOString(),
    };
    const filters = {
      location: "Melbourne, VIC",
      distance: 100,
      listedWithin: 3,
    };
    expect(filterJobs([nearby, far, old], filters).map((j) => j.id)).toEqual([
      "near",
    ]);
    const parsed = parseJobQuery(
      new URLSearchParams(
        serialiseJobQuery({
          ...filters,
          listedFrom: "2026-01-01",
          listedTo: "2026-12-31",
        }),
      ),
    );
    expect(parsed).toMatchObject({
      ...filters,
      listedFrom: "2026-01-01",
      listedTo: "2026-12-31",
    });
    expect(
      filterJobs([nearby], { ...filters, location: "Unknown town" }),
    ).toEqual([]);
  });
});
