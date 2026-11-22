import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  session: vi.fn(),
  customer: vi.fn(),
  stripe: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({
  getSessionContext: m.session,
  requireSession: m.session,
}));
vi.mock("@/lib/premium/billing", () => ({ customerFor: m.customer }));
vi.mock("@/lib/premium/providers", () => ({
  stripeClient: m.stripe,
  premiumAdmin: vi.fn(),
}));
import { POST as portal } from "../src/app/api/billing/portal/route";
import { POST as review } from "../src/app/api/admin/trust/route";
const origin = "https://westmere.test",
  id = "20000000-0000-4000-8000-000000000001";
const post = (path: string, body: unknown) =>
  new Request(origin + path, {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", origin);
  m.session.mockResolvedValue({
    user: { id: "caller" },
    supabase: { rpc: m.rpc },
    business: null,
  });
});
it("blocks the standalone personal billing portal for every business account before resolving customers", async () => {
  for (const business of [
    { kind: "employer", tier: "growth" },
    { kind: "employer", tier: "enterprise" },
    { kind: "agency", tier: "agency_enterprise" },
  ]) {
    m.session.mockResolvedValue({
      user: { id: "business" },
      supabase: {},
      business,
      isPremium: true,
    });
    const r = await portal(post("/api/billing/portal", {}));
    expect(r.status).toBe(403);
    expect((await r.json()).error).toContain("personal account");
  }
  expect(m.customer).not.toHaveBeenCalled();
  expect(m.stripe).not.toHaveBeenCalled();
});
it("sends the chosen employer/agency classification and independent shared-ABN check only through the protected review RPC", async () => {
  m.rpc.mockImplementation(async (name: string) =>
    name === "my_staff_role"
      ? { data: "admin", error: null }
      : { data: { status: "approved" }, error: null },
  );
  const r = await review(
    post("/api/admin/trust", {
      kind: "verification",
      id,
      action: "approve",
      reason: "Independently checked separate trading brand authority.",
      version: "2026-11-21T00:00:00.123456+00:00",
      identityChecked: true,
      ownershipChecked: true,
      approvedKind: "agency",
      sharedAbnChecked: true,
    }),
  );
  expect(r.status).toBe(200);
  expect(m.rpc).toHaveBeenCalledWith(
    "review_business_verification",
    expect.objectContaining({
      p_approved_kind: "agency",
      p_shared_abn_checked: true,
      p_version: "2026-11-21T00:00:00.123456+00:00",
    }),
  );
});
it("requires reviewer permissions before accepting a classification", async () => {
  m.rpc.mockResolvedValue({ data: null, error: null });
  expect(
    (
      await review(
        post("/api/admin/trust", {
          kind: "verification",
          id,
          action: "approve",
          reason: "A normal account cannot approve a business.",
          version: null,
          approvedKind: "agency",
        }),
      )
    ).status,
  ).toBe(403);
  expect(m.rpc).not.toHaveBeenCalledWith(
    "review_business_verification",
    expect.anything(),
  );
});
