import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  session: vi.fn(),
  business: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({ requireSession: m.session }));
vi.mock("@/lib/server/business", () => ({ businessFor: m.business }));
vi.mock("@/lib/premium/providers", () => ({
  premiumAdmin: () => ({ rpc: m.rpc }),
}));
import { GET } from "../src/app/api/employers/discovery/route";
import { discoveryKeyword, discoveryRegion } from "../src/lib/discovery";
const org = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
beforeEach(() => {
  vi.clearAllMocks();
  m.session.mockResolvedValue({ supabase: {}, user: { id: "team-member" } });
  m.rpc.mockResolvedValue({
    data: { totals: [], regions: [], keywords: [] },
    error: null,
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("Discovery privacy and access", () => {
  it("does not retain arbitrary search text or personal details as a keyword", () => {
    for (const text of [
      "name@example.test",
      "I have a health condition",
      "call 0412345678",
      "https://example.test",
      "design for Alice",
    ]) {
      expect(discoveryKeyword(text)).toBe("");
    }
    expect(discoveryKeyword(" Product Design ")).toBe("product design");
  });
  it("uses only an approximate platform region and never trusts geography on local requests", () => {
    const h = new Headers({
      "x-vercel-ip-country": "AU",
      "x-vercel-ip-country-region": "VIC",
    });
    expect(discoveryRegion(h, true)).toBe("VIC");
    expect(discoveryRegion(h, false)).toBe("UNKNOWN");
    h.set("x-vercel-ip-country-region", "not-a-region");
    expect(discoveryRegion(h, true)).toBe("UNKNOWN");
  });
  it("blocks Starter and unrelated or suspended business access before reading aggregates", async () => {
    for (const organisations of [
      [{ id: org, verified: true, role: "owner", tier: "starter" }],
      [{ id: org, verified: false, role: "owner", tier: "growth" }],
      [],
    ]) {
      m.business.mockResolvedValue({ organisations });
      expect(
        (
          await GET(
            new Request(
              `https://westmere.test/api/employers/discovery?organisation=${org}`,
            ),
          )
        ).status,
      ).toBe(403);
    }
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("reads only the chosen verified organisation with an active qualifying entitlement", async () => {
    m.business.mockResolvedValue({
      organisations: [
        { id: org, verified: true, role: "recruiter", tier: "growth" },
      ],
    });
    expect(
      (
        await GET(
          new Request(
            `https://westmere.test/api/employers/discovery?organisation=${org}&days=90`,
          ),
        )
      ).status,
    ).toBe(200);
    expect(m.rpc).toHaveBeenCalledWith("read_discovery", {
      p_org: org,
      p_days: 90,
    });
  });
});
