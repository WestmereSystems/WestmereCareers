import { describe, expect, it } from "vitest";
import { jobFromRecord } from "../src/lib/jobs-server";

describe("current business verification badges", () => {
  const row = { id: "role", company: "Example", organisation_id: "business" };
  it.each(["employer", "agency"])(
    "recognises a current verified %s",
    (kind) => {
      expect(
        jobFromRecord({
          ...row,
          advertiser_kind: kind,
          organisations: {
            is_verified: true,
            suspended_at: null,
            removed_at: null,
            is_test: false,
          },
        }).isVerified,
      ).toBe(true);
    },
  );
  it.each([
    null,
    { is_verified: false },
    { is_verified: true, suspended_at: "2026-11-21" },
    { is_verified: true, removed_at: "2026-11-21" },
    { is_verified: true, is_test: true },
  ])(
    "does not present an unavailable or test business as independently verified (%j)",
    (organisations) => {
      expect(jobFromRecord({ ...row, organisations }).isVerified).toBe(false);
    },
  );
  it("labels a fictional agency's roles even when an older listing has no test flag", () => {
    const role = jobFromRecord({
      ...row,
      advertiser_kind: "agency",
      organisations: { is_verified: true, is_test: true },
    });
    expect(role.isTest).toBe(true);
    expect(role.isVerified).toBe(false);
  });
});
