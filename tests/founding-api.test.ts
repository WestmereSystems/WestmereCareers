import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  client: vi.fn(),
  publicClient: vi.fn(),
  rpc: vi.fn(),
  send: vi.fn(),
  verify: vi.fn(),
  signOut: vi.fn(),
  user: vi.fn(),
  adminRpc: vi.fn(),
  oauth: vi.fn(),
  exchange: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.client }));
vi.mock("@/lib/supabase/public", () => ({ publicClient: m.publicClient }));
vi.mock("@/lib/premium/providers", () => ({
  premiumAdmin: () => ({ rpc: m.adminRpc }),
}));
vi.mock("@/lib/server/auth-options", () => ({
  authOptions: async () => ({ google: true, azure: true }),
}));
import { POST as requestAccess } from "../src/app/api/launch/request/route";
import { POST as signIn } from "../src/app/api/auth/sign-in/route";
import { POST as oauth } from "../src/app/api/auth/oauth/route";
import { POST as verify } from "../src/app/api/auth/verify/route";
import { GET as callback } from "../src/app/auth/callback/route";
import {
  businessOAuthCookie,
  createBusinessOAuthIntent,
} from "../src/lib/server/business-oauth";
import {
  assertStudioLaunchAccess,
  assertPurchasesOpen,
  marketplaceOpen,
} from "../src/lib/server/launch";
const origin = "https://westmere.test";
const request = (body: unknown, site = origin) =>
  new Request(origin + "/api/launch/request", {
    method: "POST",
    headers: {
      origin: site,
      "content-type": "application/json",
      "x-forwarded-for": "192.0.2.10",
    },
    body: JSON.stringify(body),
  });
const input = {
  kind: "candidate",
  email: "Alex@example.test",
  consent: true,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", origin);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-server-key");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://auth.westmere.test");
  m.rpc.mockResolvedValue({ data: { allowed: false }, error: null });
  m.adminRpc.mockResolvedValue({ data: false, error: null });
  m.publicClient.mockReturnValue({
    rpc: async () => ({ data: false, error: null }),
  });
  m.client.mockResolvedValue({
    rpc: m.rpc,
    auth: {
      signInWithOtp: m.send,
      verifyOtp: m.verify,
      signOut: m.signOut,
      getUser: m.user,
      signInWithOAuth: m.oauth,
      exchangeCodeForSession: m.exchange,
    },
  });
  m.user.mockResolvedValue({ data: { user: null }, error: null });
  m.verify.mockResolvedValue({
    data: { user: { id: "new" }, session: {} },
    error: null,
  });
  m.signOut.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe("founding launch API boundaries", () => {
  it("records a candidate launch-update request with a keyed network identifier, without creating an account or sending an email", async () => {
    m.adminRpc.mockResolvedValue({ data: null, error: null });
    const r = await requestAccess(request(input));
    expect(r.status).toBe(200);
    expect(m.adminRpc).toHaveBeenCalledWith(
      "submit_launch_request",
      expect.objectContaining({
        p_email: "alex@example.test",
        p_kind: "candidate",
        p_network: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    expect(m.send).not.toHaveBeenCalled();
    expect(m.verify).not.toHaveBeenCalled();
  });
  it("requires specific contact permission and rejects confidential extra fields", async () => {
    for (const body of [
      { ...input, consent: false },
      { ...input, cv: "private candidate text" },
    ])
      expect((await requestAccess(request(body))).status).toBe(400);
    expect(m.adminRpc).not.toHaveBeenCalled();
  });
  it("rejects cross-origin requests before using the database", async () => {
    expect(
      (await requestAccess(request(input, "https://other.test"))).status,
    ).toBe(403);
    expect(m.adminRpc).not.toHaveBeenCalled();
  });
  it("rejects unsafe legacy vacancy URL schemes", async () => {
    expect(
      (
        await requestAccess(
          request({ ...input, vacancyUrl: "javascript:alert(1)" }),
        )
      ).status,
    ).toBe(400);
    expect(m.adminRpc).not.toHaveBeenCalled();
  });
  it("directs legacy employer access requests to registration without saving another approval request", async () => {
    const r = await requestAccess(
      request({
        ...input,
        kind: "agency",
        name: "Synthetic Owner",
        business: "Synthetic Agency",
      }),
    );
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({
      registerUrl: "/launch/register?kind=agency",
    });
    expect(m.adminRpc).not.toHaveBeenCalled();
  });
  it("does not expose email-list membership through repeated submissions", async () => {
    m.adminRpc.mockResolvedValue({ error: null });
    const a = await requestAccess(request(input)),
      b = await requestAccess(request(input));
    expect(await a.json()).toEqual(await b.json());
  });
  it("rejects an unapproved email before generating a sign-in code", async () => {
    expect(
      (await signIn(request({ email: "uninvited@example.test" }))).status,
    ).toBe(403);
    expect(m.send).not.toHaveBeenCalled();
  });
  it("permits self-service registration with normal one-time-code sign-in", async () => {
    m.adminRpc.mockResolvedValue({ data: true, error: null });
    m.send.mockResolvedValue({ error: null });
    expect(
      (
        await signIn(
          request({ email: "new-business@example.test", intent: "employer" }),
        )
      ).status,
    ).toBe(200);
    expect(m.send).toHaveBeenCalledOnce();
    expect(m.send.mock.calls[0][0].options.shouldCreateUser).toBe(true);
    expect(m.adminRpc).toHaveBeenCalledWith(
      "prepare_business_signup",
      expect.objectContaining({
        p_email: "new-business@example.test",
        p_kind: "employer",
        p_network: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });
  it("uses existing-user-only email sign-in for approved accounts before launch", async () => {
    m.adminRpc.mockResolvedValue({ data: true, error: null });
    m.send.mockResolvedValue({ error: null });
    expect(
      (await signIn(request({ email: "staff@example.test" }))).status,
    ).toBe(200);
    expect(m.send.mock.calls[0][0].options.shouldCreateUser).toBe(false);
    expect(m.adminRpc).not.toHaveBeenCalledWith(
      "prepare_business_signup",
      expect.anything(),
    );
  });
  it("allows applicant email registration after the public marketplace opens", async () => {
    m.publicClient.mockReturnValue({
      rpc: async () => ({ data: true, error: null }),
    });
    m.adminRpc.mockResolvedValue({ data: true, error: null });
    m.send.mockResolvedValue({ error: null });
    expect(
      (await signIn(request({ email: "new-applicant@example.test" }))).status,
    ).toBe(200);
    expect(m.send.mock.calls[0][0].options.shouldCreateUser).toBe(true);
  });
  it("blocks ordinary Google and Microsoft sign-up before contacting the provider", async () => {
    for (const provider of ["google", "azure"])
      expect((await oauth(request({ provider }))).status).toBe(403);
    expect(m.oauth).not.toHaveBeenCalled();
  });
  it.each(["google", "azure"])(
    "starts %s business OAuth without typing an email and signs the business flow",
    async (provider) => {
      m.oauth.mockResolvedValue({
        data: {
          url: `https://auth.westmere.test/auth/v1/authorize?provider=${provider}`,
        },
        error: null,
      });
      const response = await oauth(request({ provider, intent: "agency" }));
      expect(response.status).toBe(200);
      expect(response.cookies.get(businessOAuthCookie)?.value).toContain(".");
      expect(response.headers.get("set-cookie")).toContain("HttpOnly");
      expect(response.headers.get("set-cookie")).toContain(
        "Path=/auth/callback",
      );
      expect(m.adminRpc).not.toHaveBeenCalled();
      expect(m.oauth).toHaveBeenCalledOnce();
      expect(m.oauth).toHaveBeenCalledWith({
        provider,
        options: {
          redirectTo: `${origin}/auth/callback`,
          skipBrowserRedirect: true,
          queryParams: { prompt: "select_account" },
          ...(provider === "azure" ? { scopes: "email" } : {}),
        },
      });
    },
  );
  it.each(["google", "azure"] as const)(
    "uses the verified %s account email after PKCE exchange, not any typed email",
    async (provider) => {
      const token = createBusinessOAuthIntent("agency", provider);
      m.exchange.mockResolvedValue({
        data: {
          user: {
            id: "provider-owner",
            email: "chosen-account@example.test",
            email_confirmed_at: new Date().toISOString(),
            identities: [{ provider }],
          },
          session: {},
        },
        error: null,
      });
      m.rpc.mockResolvedValue({ data: { allowed: true }, error: null });
      m.adminRpc.mockResolvedValue({ data: true, error: null });
      const response = await callback(
        new Request(
          origin +
            "/auth/callback?code=verified-code&email=ignored@example.test",
          { headers: { cookie: `${businessOAuthCookie}=${token}` } },
        ),
      );
      expect(response.headers.get("location")).toBe(
        origin + "/employers/sign-in?complete=1&kind=agency",
      );
      expect(m.adminRpc).toHaveBeenCalledWith(
        "prepare_business_signup",
        expect.objectContaining({
          p_email: "chosen-account@example.test",
          p_kind: "agency",
        }),
      );
      expect(response.cookies.get(businessOAuthCookie)?.value).toBe("");
    },
  );
  it("does not admit a provider identity through a forged business-intent cookie", async () => {
    m.exchange.mockResolvedValue({
      data: {
        user: {
          id: "unapproved",
          email: "unknown@example.test",
          email_confirmed_at: new Date().toISOString(),
          identities: [{ provider: "google" }],
        },
        session: {},
      },
      error: null,
    });
    const response = await callback(
      new Request(origin + "/auth/callback?code=verified-code", {
        headers: {
          cookie:
            "wm-business-intent=employer; wm-business-oauth=forged.signature",
        },
      }),
    );
    expect(response.headers.get("location")).toBe(
      origin + "/launch?access=required",
    );
    expect(m.adminRpc).not.toHaveBeenCalled();
    expect(m.signOut).toHaveBeenCalledOnce();
  });
  it.each([null, "provider-mismatch"])(
    "rejects unverified or mismatched provider identity: %s",
    async (check) => {
      const token = createBusinessOAuthIntent("employer", "google");
      m.exchange.mockResolvedValue({
        data: {
          user: {
            id: "unapproved",
            email: "unknown@example.test",
            email_confirmed_at: check ? new Date().toISOString() : null,
            identities: [{ provider: check ? "azure" : "google" }],
          },
          session: {},
        },
        error: null,
      });
      const response = await callback(
        new Request(origin + "/auth/callback?code=verified-code", {
          headers: { cookie: `${businessOAuthCookie}=${token}` },
        }),
      );
      expect(response.headers.get("location")).toBe(
        origin + "/launch?access=required",
      );
      expect(m.adminRpc).not.toHaveBeenCalled();
      expect(m.signOut).toHaveBeenCalledOnce();
    },
  );
  it("signs out a verified code if founding access has been revoked", async () => {
    expect(
      (await verify(request({ email: "revoked@example.test", code: "123456" })))
        .status,
    ).toBe(403);
    expect(m.signOut).toHaveBeenCalledOnce();
  });
  it("denies the OAuth/email callback even if session revocation encounters an error", async () => {
    m.signOut.mockRejectedValue(new Error("provider unavailable"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await callback(
      new Request(
        origin + "/auth/callback?token_hash=" + "a".repeat(64) + "&type=email",
      ),
    );
    expect(response.headers.get("location")).toBe(
      origin + "/launch?access=required",
    );
    vi.restoreAllMocks();
  });
  it("keeps anonymous Studio and Careers+ purchases closed while permitting optional business plans", async () => {
    await expect(assertStudioLaunchAccess()).rejects.toMatchObject({
      status: 403,
    });
    await expect(assertPurchasesOpen()).rejects.toMatchObject({ status: 403 });
    await expect(assertPurchasesOpen("employer")).resolves.toBeUndefined();
    await expect(assertPurchasesOpen("agency")).resolves.toBeUndefined();
  });
  it("fails closed when launch settings cannot be read", async () => {
    m.publicClient.mockReturnValue({
      rpc: async () => ({ data: null, error: { code: "unavailable" } }),
    });
    expect(await marketplaceOpen()).toBe(false);
  });
});
