import { describe, expect, it } from "vitest";
import {
  assistantIdentity,
  readGuestToken,
} from "../src/lib/server/assistant-identity";
const secret = "test-only-server-secret";
const request = new Request("https://westmere.test/api/assistant", {
  headers: { "x-forwarded-for": "192.0.2.42" },
});
describe("anonymous AI allowance identifiers", () => {
  it("signs the browser token and refuses tampering", () => {
    const first = assistantIdentity(undefined, null, request, secret);
    expect(readGuestToken(first.token, secret)).toBeTruthy();
    expect(
      assistantIdentity(first.token, null, request, secret).principal,
    ).toBe(first.principal);
    expect(
      readGuestToken(
        first.token.replace(/.$/, first.token.endsWith("0") ? "1" : "0"),
        secret,
      ),
    ).toBeNull();
    expect(readGuestToken(first.token, "another-key")).toBeNull();
  });
  it("uses account identity independently of a guest cookie and stores no raw identifiers", () => {
    const first = assistantIdentity(
      undefined,
      "verified-account",
      request,
      secret,
    );
    const second = assistantIdentity(
      "untrusted-cookie",
      "verified-account",
      request,
      secret,
    );
    expect(first.principal).toBe(second.principal);
    expect(first.cap).toBe(3);
    expect(first.principal).toMatch(/^[a-f0-9]{64}$/);
    expect(first.abuse).toMatch(/^[a-f0-9]{64}$/);
    expect(first.principal).not.toContain("verified-account");
    expect(first.abuse).not.toContain("192.0.2");
  });
});
