import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  employer: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({ requireSession: mocks.session }));
vi.mock("@/lib/server/employers", () => ({ requireEmployer: mocks.employer }));
import { POST } from "../src/app/api/employers/applications/evidence/route";
const org = "20000000-0000-4000-8000-000000000001",
  jobId = "30000000-0000-4000-8000-000000000001",
  application = "40000000-0000-4000-8000-000000000001";
const context = () => ({
  supabase: { rpc: mocks.rpc },
  business: { organisations: [{ id: org, verified: true, tier: "growth" }] },
});
function request(ids = [application]) {
  return new Request(
    "https://westmere.test/api/employers/applications/evidence",
    {
      method: "POST",
      headers: {
        origin: "https://westmere.test",
        "content-type": "application/json",
      },
      body: JSON.stringify({ jobId, applicationIds: ids }),
    },
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://westmere.test");
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({
      data: {
        organisation_id: org,
        requirements: ["CRM experience"],
        skills: [],
      },
    }),
  };
  mocks.session.mockResolvedValue({ supabase: { from: () => query } });
  mocks.employer.mockResolvedValue(context());
  mocks.rpc.mockImplementation(async (name) =>
    name === "list_job_applications"
      ? { data: [{ id: application, withdrawn_at: null }] }
      : {
          data: {
            cv_text_snapshot:
              "Private contact detail.\nManaged CRM systems for customers.",
            cover_letter: "",
          },
        },
  );
});
afterEach(() => vi.unstubAllEnvs());
it("gates Growth on the server before reading any application documents", async () => {
  const account = context();
  account.business.organisations[0].tier = "starter";
  mocks.employer.mockResolvedValue(account);
  expect((await POST(request())).status).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("rejects application IDs belonging to another role before opening a document", async () => {
  expect(
    (await POST(request(["40000000-0000-4000-8000-000000000002"]))).status,
  ).toBe(403);
  expect(mocks.rpc).not.toHaveBeenCalledWith(
    "open_application",
    expect.anything(),
  );
});
it("uses the existing intentional-open RPC and returns excerpts, never whole CVs or scores", async () => {
  const response = await POST(request());
  const data = await response.json();
  expect(response.status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith("open_application", {
    p_application_id: application,
  });
  expect(JSON.stringify(data)).toContain("Managed CRM systems");
  expect(JSON.stringify(data)).not.toContain("Private contact detail");
  expect(data.comparisons[0]).not.toHaveProperty("score");
});
it("honours withdrawal during the lookup and bounds each request to twenty applications", async () => {
  mocks.rpc.mockImplementation(async (name) =>
    name === "list_job_applications"
      ? { data: [{ id: application, withdrawn_at: null }] }
      : { error: { code: "42501" } },
  );
  expect(await (await POST(request())).json()).toEqual({ comparisons: [] });
  mocks.session.mockClear();
  expect((await POST(request(Array(21).fill(application)))).status).toBe(400);
  expect(mocks.session).not.toHaveBeenCalled();
});
