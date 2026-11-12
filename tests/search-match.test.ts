import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ session: vi.fn(), inventory: vi.fn() }));
vi.mock("../src/lib/server/auth", () => ({ getSessionContext: mock.session }));
vi.mock("../src/lib/jobs-server", () => ({
  getPublicJobs: mock.inventory,
  parseJobQuery: () => ({}),
}));
import { POST } from "../src/app/api/jobs/match/route";
import { demoJobs } from "../src/lib/jobs";

const request = (body: unknown, origin = "https://westmere.test") =>
  new Request("https://westmere.test/api/jobs/match", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://westmere.test");
});
describe("private Premium CV matching", () => {
  it("rejects cross-origin requests before reading account data", async () => {
    const response = await POST(request({}, "https://untrusted.test"));
    expect(response.status).toBe(403);
    expect(mock.session).not.toHaveBeenCalled();
  });
  it("does not trust a browser Premium flag", async () => {
    mock.session.mockResolvedValue({
      supabase: {},
      user: { id: "user" },
      isPremium: false,
    });
    const response = await POST(request({ isPremium: true }));
    expect(response.status).toBe(403);
    expect(mock.inventory).not.toHaveBeenCalled();
  });
  it("requires explicit consent before processing a CV", async () => {
    mock.session.mockResolvedValue({
      supabase: {},
      user: { id: "user" },
      isPremium: true,
    });
    const response = await POST(
      request({
        query: "",
        cv: "React TypeScript CSS Testing Accessibility experienced engineer",
        consent: false,
      }),
    );
    expect(response.status).toBe(400);
    expect(mock.inventory).not.toHaveBeenCalled();
  });
  it("returns bounded skill evidence without reflecting the private CV", async () => {
    mock.session.mockResolvedValue({
      supabase: {},
      user: { id: "user" },
      isPremium: true,
    });
    mock.inventory.mockResolvedValue({
      jobs: [demoJobs[2]],
      source: "live",
      total: 850,
    });
    const response = await POST(
      request({
        query: "q=engineer",
        cv: "PRIVATE NAME. Experienced in React TypeScript CSS Testing and Accessibility.",
        consent: true,
        page: 1,
        strongOnly: true,
      }),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.searchedCount).toBe(1);
    expect(body.searchTotal).toBe(850);
    expect(body.matches[demoJobs[2].id].score).toBe(1);
    expect(JSON.stringify(body)).not.toContain("PRIVATE NAME");
    expect(mock.inventory).toHaveBeenCalledWith({ page: 1, pageSize: 200 });
  });
  it("keeps the selected salary sort when CV matching remains enabled", async () => {
    mock.session.mockResolvedValue({
      supabase: {},
      user: { id: "user" },
      isPremium: true,
    });
    mock.inventory.mockResolvedValue({
      jobs: [demoJobs[2], demoJobs[13]],
      source: "live",
      total: 2,
    });
    const response = await POST(
      request({
        query: "q=engineer",
        cv: "Experienced in React TypeScript CSS Testing and Accessibility.",
        consent: true,
        page: 1,
        strongOnly: true,
        sort: "salary-high",
      }),
    );
    const body = await response.json();
    expect(body.jobs.map((job: { id: string }) => job.id)).toEqual([
      demoJobs[13].id,
      demoJobs[2].id,
    ]);
  });
});
