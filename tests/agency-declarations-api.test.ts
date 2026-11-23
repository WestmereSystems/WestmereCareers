import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ session: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ requireSession: m.session }));
import { GET, POST } from "../src/app/api/employers/agency/route";
const org = "91000000-0000-4000-8000-000000000001";
const client = "92000000-0000-4000-8000-000000000001";
function req(
  action: string,
  details: Record<string, unknown> = {},
  origin = "https://westmere.test",
) {
  return new Request("https://westmere.test/api/employers/agency", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ action, organisationId: org, id: client, details }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://westmere.test");
  m.session.mockResolvedValue({
    supabase: { rpc: m.rpc },
    business: { needsOnboarding: false },
  });
  m.rpc.mockResolvedValue({ data: { saved: true }, error: null });
});
afterEach(() => vi.unstubAllEnvs());
it("serves the paginated Admin relationship register through the authenticated RPC", async () => {
  expect(
    (
      await GET(
        new Request(
          "https://westmere.test/api/employers/agency?review=1&offset=50",
        ),
      )
    ).status,
  ).toBe(200);
  expect(m.rpc).toHaveBeenCalledWith("manage_agency", {
    p_action: "relationship_register",
    p_org: null,
    p_details: { offset: 50 },
  });
  m.rpc.mockClear();
  expect(
    (
      await GET(
        new Request(
          "https://westmere.test/api/employers/agency?review=1&offset=-1",
        ),
      )
    ).status,
  ).toBe(400);
  expect(m.rpc).not.toHaveBeenCalled();
});
it("accepts a versioned declaration and rejects cross-origin requests or obsolete declaration versions", async () => {
  const details = {
    advertisingConfirmed: true,
    declarationVersion: "agency-advertising-v1",
    evidence: "External agreement authorises this current recruitment scope.",
    validFrom: "2026-11-23T00:00:00Z",
    validUntil: "2027-01-23T00:00:00Z",
  };
  expect((await POST(req("declare_client", details))).status).toBe(200);
  expect(m.rpc).toHaveBeenCalledWith(
    "manage_agency",
    expect.objectContaining({ p_action: "declare_client", p_details: details }),
  );
  m.rpc.mockClear();
  expect(
    (
      await POST(
        req("declare_client", { ...details, declarationVersion: "outdated" }),
      )
    ).status,
  ).toBe(400);
  expect(
    (await POST(req("declare_client", details, "https://unrelated.example")))
      .status,
  ).toBe(403);
  expect(m.rpc).not.toHaveBeenCalled();
});
it("lets employers dispute and Admin revoke without requiring fresh business terms, while SQL still enforces their authority", async () => {
  m.session.mockResolvedValue({ supabase: { rpc: m.rpc }, business: null });
  expect(
    (
      await POST(
        req("dispute", {
          version: "2026-11-23T00:00:00Z",
          reason: "This agency has no authority to advertise for us.",
        }),
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await POST(
        req("revoke", {
          reason: "Independent reviewer revokes unauthorised advertising.",
        }),
      )
    ).status,
  ).toBe(200);
  m.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
  expect(
    (
      await POST(
        req("revoke", {
          reason: "An unrelated account attempts to revoke authority.",
        }),
      )
    ).status,
  ).toBe(403);
  expect((await POST(req("declare_client", {}))).status).toBe(409);
});
