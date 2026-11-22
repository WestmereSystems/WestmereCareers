import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  session: vi.fn(),
  write: vi.fn(),
  revoke: vi.fn(),
  read: vi.fn(),
  admin: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({ requireSession: m.session }));
vi.mock("@/lib/premium/billing", () => ({
  withBillingLease: async (_u: string, work: (l: unknown) => unknown) =>
    work({ token: "lease" }),
}));
vi.mock("@/lib/premium/convert-business", () => ({
  revokePersonalSubscription: m.revoke,
}));
vi.mock("@/lib/premium/providers", () => ({ premiumAdmin: m.admin }));
import { POST } from "../src/app/api/employers/account/route";
import terms from "../src/content/terms-and-conditions.json";
const origin = "https://westmere.test";
const payload = {
  kind: "employer",
  tradingName: "Example Studio",
  businessEmail: "owner@example.test",
  termsAccepted: true,
  conversionAccepted: true,
};
const request = (body: unknown) =>
  new Request(origin + "/api/employers/account", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", origin);
  m.session.mockResolvedValue({
    user: {
      id: "owner",
      email: "owner@example.test",
      email_confirmed_at: "2026-11-16T00:00:00Z",
      last_sign_in_at: new Date().toISOString(),
    },
    isPremium: false,
  });
  m.admin.mockReturnValue({
    rpc: m.write,
    from: () => ({
      upsert: m.write,
      select: () => ({ eq: () => ({ maybeSingle: m.read }) }),
    }),
  });
  m.read.mockResolvedValue({ data: null, error: null });
  m.write.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe("business onboarding", () => {
  it("requires express terms acceptance and derives the account from the verified session", async () => {
    expect(
      (await POST(request({ ...payload, termsAccepted: false }))).status,
    ).toBe(400);
    expect(m.write).not.toHaveBeenCalled();
    expect(
      (await POST(request({ ...payload, userId: "someone-else" }))).status,
    ).toBe(400);
    expect((await POST(request(payload))).status).toBe(200);
    expect(m.write).toHaveBeenCalledWith(
      "complete_business_registration",
      expect.objectContaining({
        p_user: "owner",
        p_kind: "employer",
        p_terms: terms.version,
        p_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });
  it("requires a recent sign-in before converting an existing account", async () => {
    m.session.mockResolvedValue({
      user: {
        id: "owner",
        email: "owner@example.test",
        email_confirmed_at: "2026-11-16T00:00:00Z",
        last_sign_in_at: new Date(Date.now() - 16 * 60_000).toISOString(),
      },
      isPremium: false,
    });
    expect((await POST(request(payload))).status).toBe(401);
    expect(m.write).not.toHaveBeenCalled();
  });
  it("does not attach a business email different from the authenticated identity", async () => {
    expect(
      (
        await POST(
          request({ ...payload, businessEmail: "another@example.test" }),
        )
      ).status,
    ).toBe(400);
    expect(m.write).not.toHaveBeenCalled();
  });
  it("renews Enterprise business Terms without overwriting reviewed account type", async () => {
    m.session.mockResolvedValue({
      user: {
        id: "owner",
        email: "owner@example.test",
        email_confirmed_at: "2026-11-16T00:00:00Z",
        last_sign_in_at: new Date().toISOString(),
      },
      isPremium: true,
      business: { kind: "employer" },
    });
    m.read.mockResolvedValue({ data: { kind: "employer" }, error: null });
    expect((await POST(request({ ...payload, kind: "agency" }))).status).toBe(
      200,
    );
    expect(m.write.mock.calls[0][1]).toHaveProperty("p_kind", "employer");
    expect(m.write.mock.calls[0][1]).toMatchObject({
      p_user: "owner",
      p_terms: terms.version,
    });
  });
  it("protects an existing paid individual subscription during business onboarding", async () => {
    m.session.mockResolvedValue({
      user: {
        id: "owner",
        email: "owner@example.test",
        email_confirmed_at: "2026-11-16T00:00:00Z",
        last_sign_in_at: new Date().toISOString(),
      },
      isPremium: true,
    });
    expect(
      (await POST(request({ ...payload, conversionAccepted: false }))).status,
    ).toBe(409);
    expect(m.write).not.toHaveBeenCalled();
  });
});

it("preserves the stored agency kind when renewing from an employer workspace context", async () => {
  m.read.mockResolvedValue({ data: { kind: "agency" }, error: null });
  m.session.mockResolvedValue({
    user: {
      id: "owner",
      email: "owner@example.test",
      email_confirmed_at: "2026-11-21",
      last_sign_in_at: new Date().toISOString(),
    },
    isPremium: false,
    business: { kind: "employer" },
  });
  expect((await POST(request(payload))).status).toBe(200);
  expect(m.write).toHaveBeenCalledWith(
    "complete_business_registration",
    expect.objectContaining({ p_kind: "agency" }),
  );
});

it("cancels personal billing before committing an explicitly acknowledged conversion", async () => {
  m.session.mockResolvedValue({
    user: {
      id: "owner",
      email: "owner@example.test",
      email_confirmed_at: "2026-11-16",
      last_sign_in_at: new Date().toISOString(),
    },
    isPremium: true,
  });
  expect((await POST(request(payload))).status).toBe(200);
  expect(m.revoke).toHaveBeenCalled();
  expect(m.revoke.mock.invocationCallOrder[0]).toBeLessThan(
    m.write.mock.invocationCallOrder[0],
  );
});
it("leaves the personal account unchanged if Stripe cannot cancel its subscription", async () => {
  m.revoke.mockRejectedValueOnce(Error("provider unavailable"));
  expect((await POST(request(payload))).status).toBe(503);
  expect(m.write).not.toHaveBeenCalled();
});
