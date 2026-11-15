import { describe, expect, it } from "vitest";
import {
  summariseHiring,
  type HiringApplication,
  type HiringRole,
} from "../src/lib/hiring-statistics";
const now = Date.parse("2026-11-15T12:00:00Z");
const day = 86_400_000;
const date = (ago: number) => new Date(now - ago * day).toISOString();
const roles: HiringRole[] = [
  {
    id: "design",
    organisation_id: "westmere",
    title: "Designer",
    status: "published",
    published_at: date(40),
    expires_at: null,
  },
  {
    id: "support",
    organisation_id: "westmere",
    title: "Support",
    status: "published",
    published_at: date(40),
    expires_at: date(1),
  },
  {
    id: "draft",
    organisation_id: "westmere",
    title: "Draft",
    status: "draft",
    published_at: null,
    expires_at: null,
  },
];
const application = (
  id: string,
  ago: number,
  status = "received",
  events: HiringApplication["application_events"] = [],
): HiringApplication => ({
  id,
  job_id: "design",
  status,
  created_at: date(ago),
  application_events: events,
});
describe("non-identifying hiring statistics", () => {
  it("separates current availability, submission cohorts and mutually exclusive current stages", () => {
    const stats = summariseHiring(
      roles,
      [
        application("new", 1),
        application("old", 35, "offer"),
        application("older", 70),
        application("future", -1),
        application("offer", 10, "offer"),
      ],
      30,
      now,
    );
    expect(stats.openRoles).toBe(1);
    expect(stats.closedRoles).toBe(1);
    expect(stats.draftRoles).toBe(1);
    expect(stats.totalApplications).toBe(2);
    expect(stats.previousApplications).toBe(1);
    expect(stats.offers).toBe(1);
    expect(stats.stages.reduce((sum, stage) => sum + stage.count, 0)).toBe(2);
    expect(stats.trend.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(2);
  });
  it("uses the earliest intentional open, distinguishes updates from opens, and ignores impossible event dates", () => {
    const stats = summariseHiring(
      roles,
      [
        application("reviewed", 10, "offer", [
          { event_type: "opened", occurred_at: date(8) },
          { event_type: "opened", occurred_at: date(7) },
          { event_type: "decision", occurred_at: date(5) },
          { event_type: "employer_update", occurred_at: date(6) },
        ]),
        application("invalid", 10, "received", [
          { event_type: "opened", occurred_at: date(11) },
          { event_type: "opened", occurred_at: date(-1) },
        ]),
      ],
      30,
      now,
    );
    expect(stats.reviewed).toBe(1);
    expect(stats.reviewRate).toBe(50);
    expect(stats.averageFirstReviewDays).toBe(2);
    expect(stats.averageFirstResponseDays).toBe(4);
    expect(stats.responseSample).toBe(1);
    expect(stats.awaitingReview).toBe(1);
    expect(stats.awaitingOverSevenDays).toBe(1);
  });
  it("reports missing evidence as unavailable instead of inventing response times or conversions", () => {
    const stats = summariseHiring(
      roles,
      [application("untouched", 3)],
      30,
      now,
    );
    expect(stats.averageFirstResponseDays).toBeNull();
    expect(stats.averageFirstReviewDays).toBeNull();
    expect(stats.responseSample).toBe(0);
    expect(stats.awaitingReview).toBe(1);
    expect(summariseHiring([], [], 30, now).reviewRate).toBeNull();
    expect(stats).not.toHaveProperty("hireRate");
    expect(stats.byRole[0]).not.toHaveProperty("candidate_id");
  });
});
