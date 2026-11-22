import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  scope: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({ requireSession: mocks.session }));
import { POST } from "../src/app/api/employers/route";
const id = "30000000-0000-4000-8000-000000000001",
  organisationId = "20000000-0000-4000-8000-000000000001";
const body = {
  id,
  organisationId,
  title: "Synthetic role",
  location: "Melbourne, VIC",
  city: "Melbourne",
  state: "VIC",
  category: "Administration",
  workMode: "Hybrid",
  employmentType: "Full time",
  description:
    "SYNTHETIC TEST ONLY. A sufficiently detailed fictional role introduction.",
  salaryMin: null,
  salaryMax: null,
  contentLabels: { about: "Inside this opportunity" },
};
function request(payload: unknown) {
  return new Request("https://westmere.test/api/employers", {
    method: "POST",
    headers: {
      origin: "https://westmere.test",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://westmere.test");
  const write = {
    select: () => write,
    eq: mocks.scope,
    single: async () => ({
      data: { id, title: body.title, status: "draft" },
      error: null,
    }),
  };
  mocks.scope.mockReturnValue(write);
  mocks.update.mockImplementation((values) => {
    if ("organisation_id" in values)
      throw Error("The database denies updates to ownership columns");
    return write;
  });
  mocks.insert.mockReturnValue(write);
  const query = (data: unknown) => {
    const q = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => ({ data }),
      single: async () => ({ data }),
    };
    return q;
  };
  mocks.session.mockResolvedValue({
    user: { id: "owner" },
    business: { needsOnboarding: false },
    supabase: {
      from: (table: string) =>
        table === "organisation_members"
          ? query({ role: "owner" })
          : table === "organisations"
            ? query({
                name: "Example company",
                is_verified: true,
                suspended_at: null,
              })
            : { update: mocks.update, insert: mocks.insert },
    },
  });
});
afterEach(() => vi.unstubAllEnvs());
it("saves custom copy and an omitted salary without attempting to change immutable ownership", async () => {
  const response = await POST(request(body));
  expect(response.status).toBe(201);
  expect(mocks.update).toHaveBeenCalledWith(
    expect.objectContaining({
      salary_min: null,
      salary_max: null,
      content_labels: body.contentLabels,
      description: body.description,
      publication_requested: false,
    }),
  );
  expect(mocks.scope).toHaveBeenCalledWith("id", id);
  expect(mocks.scope).toHaveBeenCalledWith("organisation_id", organisationId);
});
it("binds a new role to the checked business only on insert", async () => {
  const { id: _, ...newRole } = body;
  expect((await POST(request(newRole))).status).toBe(201);
  expect(mocks.insert).toHaveBeenCalledWith(
    expect.objectContaining({ organisation_id: organisationId }),
  );
  expect(mocks.update).not.toHaveBeenCalled();
});
it("rejects partial salary ranges before checking permissions or saving", async () => {
  expect((await POST(request({ ...body, salaryMin: 50000 }))).status).toBe(400);
  expect(mocks.session).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});
