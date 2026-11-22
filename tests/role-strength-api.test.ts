import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), jobs: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ getSessionContext: mocks.session }));
vi.mock("@/lib/jobs-server", () => ({ getPublicJobs: mocks.jobs }));
import { POST } from "../src/app/api/jobs/role-strength/route";
import { demoJobs } from "../src/lib/jobs";
const context = {
  user: { id: "personal" },
  supabase: {},
  isPremium: true,
  business: null,
};
function request(
  body: unknown = {
    role: "Support Specialist",
    cv: "Managed CRM and payroll systems for a support team with documented results.",
  },
) {
  return new Request("https://westmere.test/api/jobs/role-strength", {
    method: "POST",
    headers: {
      origin: "https://westmere.test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://westmere.test");
  mocks.session.mockResolvedValue(context);
  mocks.jobs.mockResolvedValue({ jobs: [], source: "live", total: 0 });
});
afterEach(() => vi.unstubAllEnvs());
it.each([
  { ...context, user: null },
  { ...context, isPremium: false, business: { kind: "employer" } },
  { ...context, isPremium: false },
])(
  "keeps role strength private to Careers+ members or Enterprise billing owners",
  async (session) => {
    mocks.session.mockResolvedValue(session);
    expect([401, 403]).toContain((await POST(request())).status);
    expect(mocks.jobs).not.toHaveBeenCalled();
  },
);
it("compares every matching inventory page before choosing the top ten", async () => {
  const first = Array.from({ length: 200 }, (_, i) => ({
    ...demoJobs[0],
    id: `first-${i}`,
    title: "Support Specialist",
    requirements: ["Kubernetes"],
    skills: [],
  }));
  const winner = {
    ...demoJobs[0],
    id: "winner",
    title: "Support Specialist",
    requirements: ["CRM systems", "Payroll systems", "Age under 30"],
    skills: [],
  };
  mocks.jobs.mockImplementation(async ({ page }) => ({
    jobs: page === 1 ? first : [winner],
    total: 201,
    source: "live",
  }));
  const response = await POST(request());
  const data = await response.json();
  expect(response.status).toBe(200);
  expect(data.searchedCount).toBe(201);
  expect(data.matches).toHaveLength(10);
  expect(data.matches[0].job.id).toBe("winner");
  expect(data.matches[0].measure).toMatchObject({
    score: 100,
    evidenced: 2,
    total: 2,
  });
  expect(mocks.jobs).toHaveBeenCalledWith(
    expect.objectContaining({
      page: 2,
      pageSize: 200,
      keyword: "Support Specialist",
    }),
  );
});
it("provides recommendations from CV evidence without leaking whole private documents or calling an AI provider", async () => {
  mocks.jobs.mockResolvedValue({
    jobs: [
      {
        ...demoJobs[0],
        title: "TEST ONLY — CRM Specialist",
        requirements: ["CRM systems"],
        skills: [],
      },
    ],
    source: "live",
    total: 1,
  });
  const response = await POST(
    request({
      role: "",
      cv: "Private contact detail that should not be an excerpt.\nManaged CRM systems and support queues.",
    }),
  );
  const data = await response.json();
  expect(data.recommendedRoles[0].title).toBe("CRM Specialist");
  expect(JSON.stringify(data)).not.toContain("Private contact detail");
  expect(mocks.jobs).toHaveBeenCalledWith(
    expect.objectContaining({ keyword: undefined }),
  );
});
it("does not replace live lookup failures with partial rankings", async () => {
  mocks.jobs.mockResolvedValue({
    jobs: [],
    source: "live",
    total: 0,
    error: "Roles could not be loaded.",
  });
  expect((await POST(request())).status).toBe(503);
});
