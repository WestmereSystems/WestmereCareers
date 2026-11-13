import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  exchange: vi.fn(),
  client: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }));
import { GET } from "../src/app/auth/callback/route";
const origin = "https://westmere.test";
const hash = "a".repeat(64);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", origin);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.client.mockResolvedValue({
    auth: { verifyOtp: mocks.verify, exchangeCodeForSession: mocks.exchange },
  });
  mocks.verify.mockResolvedValue({ data: { session: {} }, error: null });
  mocks.exchange.mockResolvedValue({ data: { session: {} }, error: null });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("email authentication callback", () => {
  it("verifies an email token without a browser-bound PKCE verifier", async () => {
    const response = await GET(
      new Request(
        `${origin}/auth/callback?token_hash=${hash}&type=email&next=/account`,
      ),
    );
    expect(mocks.verify).toHaveBeenCalledWith({
      token_hash: hash,
      type: "email",
    });
    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(`${origin}/account`);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("keeps existing PKCE links working and rejects external return destinations", async () => {
    const response = await GET(
      new Request(
        `${origin}/auth/callback?code=test-code&next=https://untrusted.test`,
      ),
    );
    expect(mocks.exchange).toHaveBeenCalledWith("test-code");
    expect(response.headers.get("location")).toBe(`${origin}/`);
  });
  it("does not send mixed or unsupported credentials to the provider", async () => {
    for (const query of [
      `token_hash=${hash}&type=recovery`,
      `token_hash=${hash}&type=email&code=another`,
      "token_hash=short&type=email",
    ]) {
      const response = await GET(
        new Request(`${origin}/auth/callback?${query}`),
      );
      expect(response.headers.get("location")).toBe(`${origin}/?auth=expired`);
    }
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("handles a used token without logging its contents or provider message", async () => {
    mocks.verify.mockResolvedValue({
      data: { session: null },
      error: { code: "otp_expired", message: "sensitive token detail" },
    });
    const response = await GET(
      new Request(`${origin}/auth/callback?token_hash=${hash}&type=email`),
    );
    expect(response.headers.get("location")).toBe(`${origin}/?auth=expired`);
    expect(console.warn).toHaveBeenCalledWith(
      "Westmere sign-in callback failed",
      { code: "otp_expired" },
    );
  });
});
