import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  rpc: vi.fn(),
  generate: vi.fn(),
  getCookie: vi.fn(),
  setCookie: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({ getSessionContext: mocks.session }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.getCookie, set: mocks.setCookie }),
}));
vi.mock("@/lib/premium/providers", () => ({
  premiumAdmin: () => ({ rpc: mocks.rpc }),
  openAIClient: () => ({ responses: { create: mocks.generate } }),
}));
import { POST } from "../src/app/api/assistant/route";
const payload = {
  mode: "improve",
  consent: true,
  cv: "Experience leading customer onboarding projects and working with product and engineering teams to improve service delivery.",
};
const output = {
  summary: "Clearer language",
  improvements: ["Describe your work accurately."],
  revisedCv: payload.cv,
  coverLetter: "",
  matchedSkills: [],
  missingSkills: [],
};
const make = (body: unknown = payload, origin = "https://westmere.test") =>
  new Request("https://westmere.test/api/assistant", {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "x-forwarded-for": "192.0.2.42",
    },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://westmere.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-server-key");
  mocks.session.mockResolvedValue({
    supabase: {},
    user: null,
    isPremium: false,
  });
  mocks.getCookie.mockReturnValue(undefined);
  mocks.rpc.mockImplementation(async (name: string) => ({
    data: name === "reserve_trial_ai_usage" ? "reservation" : true,
    error: null,
  }));
  mocks.generate.mockResolvedValue({
    status: "completed",
    output_text: JSON.stringify(output),
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("AI preview consent and server cost controls", () => {
  it("rejects cross-origin requests before looking up a session", async () => {
    expect((await POST(make(payload, "https://attacker.test"))).status).toBe(
      403,
    );
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("requires consent and refuses client-supplied credits or identity", async () => {
    for (const invalid of [
      { ...payload, consent: false },
      { ...payload, remaining: 3 },
      { ...payload, tier: "Careers+" },
      { ...payload, userId: "someone-else" },
    ])
      expect((await POST(make(invalid))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("permits a guest only after an atomic reservation and sets an HTTP-only signed cookie", async () => {
    const response = await POST(make());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: output });
    expect(mocks.rpc.mock.calls[0]).toEqual([
      "reserve_trial_ai_usage",
      expect.objectContaining({
        p_tier: "guest",
        p_user: null,
        p_principal: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    ]);
    expect(mocks.setCookie).toHaveBeenCalledWith(
      "westmere-ai-preview",
      expect.stringMatching(/^[a-f0-9-]{36}\.[a-f0-9]{64}$/),
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        maxAge: 31536000,
      }),
    );
    expect(mocks.rpc).toHaveBeenCalledWith("settle_trial_ai_usage", {
      p_reservation: "reservation",
      p_success: true,
    });
  });
  it("does not call OpenAI or grant a cookie if the quota reservation fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "quota" } });
    expect((await POST(make())).status).toBe(429);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });
  it("refunds a failed generation and never exposes raw provider messages", async () => {
    mocks.generate.mockRejectedValue(
      new Error("PRIVATE CV AND PROVIDER SECRET"),
    );
    const response = await POST(make());
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("PRIVATE CV");
    expect(mocks.rpc).toHaveBeenCalledWith("settle_trial_ai_usage", {
      p_reservation: "reservation",
      p_success: false,
    });
  });
  it("takes a free-account identity from the verified server session", async () => {
    mocks.session.mockResolvedValue({
      supabase: {},
      user: { id: "verified-user", email_confirmed_at: "2026-11-15T00:00:00Z" },
      isPremium: false,
    });
    expect((await POST(make())).status).toBe(200);
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({
      p_tier: "account",
      p_user: "verified-user",
    });
    expect(mocks.setCookie).not.toHaveBeenCalled();
  });
  it("does not grant the account allowance before email verification", async () => {
    mocks.session.mockResolvedValue({
      supabase: {},
      user: { id: "unverified-user", email_confirmed_at: null },
      isPremium: false,
    });
    expect((await POST(make())).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
