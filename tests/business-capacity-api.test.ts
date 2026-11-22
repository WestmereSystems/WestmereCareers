import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ session: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ requireSession: m.session }));
import { GET } from "../src/app/api/employers/plan/route";
import { POST } from "../src/app/api/employers/verification/route";
const origin = "https://westmere.test";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", origin);
  m.session.mockResolvedValue({
    user: { id: "owner" },
    business: { needsOnboarding: false },
    supabase: { rpc: m.rpc },
  });
});
afterEach(() => vi.unstubAllEnvs());
it("returns registration capacity separately from the businesses selected for billing coverage", async () => {
  m.rpc.mockImplementation(async (name: string) => ({
    data:
      name === "my_business_plan"
        ? { used: 3, limit: 3 }
        : { owned: 4, pending: 0, used: 4, limit: 3, canSubmit: false },
    error: null,
  }));
  expect(await (await GET()).json()).toMatchObject({
    plan: { used: 3 },
    registrationCapacity: { used: 4, canSubmit: false },
  });
});
it("does not advertise capacity when its authoritative check fails", async () => {
  m.rpc.mockResolvedValue({ data: null, error: { code: "unavailable" } });
  expect((await GET()).status).toBe(503);
});
it("returns a clear plan-capacity conflict when the database rejects a new review", async () => {
  m.rpc.mockResolvedValue({ data: null, error: { code: "23514" } });
  const response = await POST(
    new Request(origin + "/api/employers/verification", {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body: JSON.stringify({
        businessName: "Test business",
        abn: "12345678901",
        website: "https://example.test",
        contactRole: "Director",
        evidence:
          "Synthetic public authority evidence for an independent business verification.",
        linkedin: "https://linkedin.com/company/synthetic",
        hrEmail: "hr@example.test",
        hrPhone: "12345678",
        contactSource: "https://example.test/contact",
        contactPermission: true,
      }),
    }),
  );
  expect(response.status).toBe(409);
  expect((await response.json()).error).toContain("business allowance is full");
});
