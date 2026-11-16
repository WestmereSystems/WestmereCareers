import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  session: vi.fn(),
  write: vi.fn(),
  admin: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({ requireSession: m.session }));
vi.mock("@/lib/premium/providers", () => ({ premiumAdmin: m.admin }));
import { POST } from "../src/app/api/employers/account/route";
const origin = "https://westmere.test";
const payload = {
  kind: "employer",
  tradingName: "Example Studio",
  businessEmail: "owner@example.test",
  termsAccepted: true,
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
  m.admin.mockReturnValue({ from: () => ({ upsert: m.write }) });
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
      expect.objectContaining({
        user_id: "owner",
        kind: "employer",
        terms_version: "2026-11-16.2",
        terms_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
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
    expect((await POST(request(payload))).status).toBe(409);
    expect(m.write).not.toHaveBeenCalled();
  });
});
