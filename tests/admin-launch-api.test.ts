import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  business: vi.fn(),
  individual: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({
  requireSession: async () => ({ supabase: { rpc: m.rpc } }),
}));
vi.mock("@/lib/premium/billing-mode", () => ({
  liveBusinessBillingReady: m.business,
  liveIndividualBillingReady: m.individual,
}));
import { POST } from "../src/app/api/admin/launch/route";
const request = (open = true) =>
  new Request("https://westmere.test/api/admin/launch", {
    method: "POST",
    headers: {
      origin: "https://westmere.test",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: "mode",
      open,
      reason: "Reviewed public launch decision",
    }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://westmere.test");
  m.rpc.mockResolvedValue({ data: "admin", error: null });
  m.business.mockReturnValue(true);
  m.individual.mockReturnValue(true);
});
it.each(["business", "individual"])(
  "blocks launch when %s live billing is incomplete",
  async (kind) => {
    m[kind as "business" | "individual"].mockReturnValue(false);
    expect((await POST(request())).status).toBe(409);
    expect(m.rpc).not.toHaveBeenCalledWith("admin_launch", expect.anything());
  },
);
it("always permits an authorised administrator to close the marketplace even when billing is unavailable", async () => {
  m.business.mockReturnValue(false);
  m.individual.mockReturnValue(false);
  expect((await POST(request(false))).status).toBe(200);
  expect(m.rpc).toHaveBeenCalledWith(
    "admin_launch",
    expect.objectContaining({ p_open: false }),
  );
});
it("never grants launch controls to an ordinary account", async () => {
  m.rpc.mockResolvedValue({ data: null, error: null });
  expect((await POST(request())).status).toBe(403);
});
