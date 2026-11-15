import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/lib/server/http";
const fixtures = vi.hoisted(() => ({
  session: vi.fn(),
  from: vi.fn(),
  membership: [] as unknown[],
  roles: [] as unknown[],
  applications: [] as unknown[],
  selects: [] as string[],
  scopes: [] as unknown[],
}));
vi.mock("@/lib/server/auth", () => ({ requireSession: fixtures.session }));
import { GET } from "../src/app/api/employers/statistics/route";
const org = "10000000-0000-4000-8000-000000000001";
const foreign = "10000000-0000-4000-8000-000000000002";
const job = "20000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.clearAllMocks();
  fixtures.selects = [];
  fixtures.scopes = [];
  fixtures.applications = [];
  fixtures.membership = [
    {
      organisation_id: org,
      role: "owner",
      organisations: {
        name: "Authorised business",
        is_verified: true,
        suspended_at: null,
      },
    },
  ];
  fixtures.roles = [
    {
      id: job,
      organisation_id: org,
      title: "Designer",
      status: "draft",
      published_at: null,
      expires_at: null,
    },
  ];
  fixtures.from.mockImplementation((table: string) => {
    const data = () => ({
      data:
        table === "organisation_members"
          ? fixtures.membership
          : table === "jobs"
            ? fixtures.roles
            : fixtures.applications,
      error: null,
    });
    const query: Record<string, unknown> = {};
    for (const method of [
      "select",
      "eq",
      "in",
      "order",
      "range",
      "is",
      "gte",
      "lte",
    ])
      query[method] = vi.fn((...args) => {
        if (method === "select") fixtures.selects.push(args[0]);
        if (method === "in") fixtures.scopes.push([table, ...args]);
        return query;
      });
    query.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve(data()).then(resolve);
    return query;
  });
  fixtures.session.mockResolvedValue({
    user: { id: "employer" },
    supabase: { from: fixtures.from },
  });
});
describe("employer statistics permissions", () => {
  it("requires authentication before reading hiring records", async () => {
    fixtures.session.mockRejectedValue(new ApiError(401, "Sign in"));
    expect(
      (await GET(new Request("https://westmere.test/api/employers/statistics")))
        .status,
    ).toBe(401);
    expect(fixtures.from).not.toHaveBeenCalled();
  });
  it("refuses another organisation or role without querying applications", async () => {
    for (const query of [`organisation=${foreign}`, `job=${foreign}`]) {
      const response = await GET(
        new Request(`https://westmere.test/api/employers/statistics?${query}`),
      );
      expect(response.status).toBe(403);
    }
    expect(fixtures.from).not.toHaveBeenCalledWith("applications");
  });
  it("scopes reads to verified active businesses and never selects candidate material", async () => {
    const response = await GET(
      new Request("https://westmere.test/api/employers/statistics?days=90"),
    );
    expect(response.status).toBe(200);
    expect(fixtures.scopes).toContainEqual(["jobs", "organisation_id", [org]]);
    expect(fixtures.scopes).toContainEqual(["applications", "job_id", [job]]);
    expect(fixtures.selects.join(" ")).not.toMatch(
      /cv_text|candidate_id|cover_letter|answers|message/,
    );
    expect((await response.json()).statistics.days).toBe(90);
  });
  it("excludes suspended or unverified memberships", async () => {
    fixtures.membership = [
      {
        organisation_id: org,
        role: "owner",
        organisations: { is_verified: true, suspended_at: "2026-11-15" },
      },
    ];
    const response = await GET(
      new Request("https://westmere.test/api/employers/statistics"),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).statistics.totalApplications).toBe(0);
    expect(fixtures.from).not.toHaveBeenCalledWith("applications");
  });
});
