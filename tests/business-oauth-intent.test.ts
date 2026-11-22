import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  businessOAuthCookie,
  createBusinessOAuthIntent,
  readBusinessOAuthIntent,
} from "../src/lib/server/business-oauth";
const request = (token: string) =>
  new Request("https://westmere.test/auth/callback", {
    headers: { cookie: `${businessOAuthCookie}=${token}` },
  });
beforeEach(() =>
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-server-only-signing-key"),
);
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it("round trips only a signed provider and business kind, without including an email", () => {
  const token = createBusinessOAuthIntent("agency", "azure");
  expect(readBusinessOAuthIntent(request(token))).toMatchObject({
    kind: "agency",
    provider: "azure",
  });
  expect(token).not.toContain("@");
});
it("rejects client tampering and cookies signed with another key", () => {
  const token = createBusinessOAuthIntent("employer", "google");
  expect(readBusinessOAuthIntent(request("x" + token))).toBeNull();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "another-key");
  expect(readBusinessOAuthIntent(request(token))).toBeNull();
});
it("expires business OAuth intent after fifteen minutes", () => {
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now);
  const token = createBusinessOAuthIntent("employer", "google");
  vi.mocked(Date.now).mockReturnValue(now + 900001);
  expect(readBusinessOAuthIntent(request(token))).toBeNull();
});
it("fails closed on missing configuration or oversized malformed tokens", () => {
  expect(readBusinessOAuthIntent(request("x".repeat(1500)))).toBeNull();
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  expect(() => createBusinessOAuthIntent("employer", "google")).toThrow(
    "being prepared",
  );
});
