// These regressions exercise the public-launch behaviour; founding access has dedicated API/database coverage.
vi.mock("@/lib/server/launch", async () => import("./fixtures/open-launch"));
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  business: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
vi.mock("@/lib/server/business", () => ({ businessFor: mocks.business }));
import { getSessionContext } from "../src/lib/server/auth";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.mockResolvedValue({
    auth: {
      getUser: async () => ({ data: { user: { id: "caller" } }, error: null }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null }) }),
      }),
    }),
    rpc: mocks.rpc,
  });
  mocks.business.mockResolvedValue({ kind: "employer", tier: "enterprise" });
  mocks.rpc.mockResolvedValue({ data: null, error: null });
});
it("does not infer Careers+ from an invited Enterprise business tier", async () => {
  expect((await getSessionContext()).isPremium).toBe(false);
  expect(mocks.rpc).toHaveBeenCalledWith("my_enterprise_careers_access");
});
it("grants Careers+ only from the current caller’s Enterprise billing period", async () => {
  mocks.rpc.mockImplementation(async (name) => ({
    data:
      name === "my_enterprise_careers_access"
        ? { startsAt: "2026-11-19", expiresAt: "2026-12-19" }
        : null,
    error: null,
  }));
  expect((await getSessionContext()).isPremium).toBe(true);
});
it("fails closed when the owner entitlement cannot be checked", async () => {
  mocks.rpc.mockResolvedValue({ error: { code: "503" } });
  await expect(getSessionContext()).rejects.toMatchObject({ status: 503 });
});
