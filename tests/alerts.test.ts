import { describe, expect, it } from "vitest";
import {
  renderAlert,
  retrySeconds,
  sameSecret,
  verifySvix,
} from "../supabase/functions/_shared/alerts";
const id = "10000000-0000-4000-8000-000000000001";
describe("Resend alert boundary", () => {
  const body = '{"event_type":"ping","data":{"success":true}}';
  const headers = new Headers({
    "svix-id": "msg_loFOjxBNrRLzqYUf",
    "svix-timestamp": "1731705121",
    "svix-signature": "v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=",
  });
  const secret = "whsec_plJ3nmyCDGBKInavdOK15jsl",
    now = 1731705121000;
  it("verifies the official Svix vector against untouched bytes and rejects stale or tampered payloads", async () => {
    expect(
      await verifySvix(new TextEncoder().encode(body), headers, secret, now),
    ).toBe(true);
    expect(
      await verifySvix(
        new TextEncoder().encode(body + " "),
        headers,
        secret,
        now,
      ),
    ).toBe(false);
    expect(
      await verifySvix(
        new TextEncoder().encode(body),
        headers,
        secret,
        now + 301000,
      ),
    ).toBe(false);
    expect(
      await verifySvix(
        new TextEncoder().encode(body),
        headers,
        secret,
        now - 301000,
      ),
    ).toBe(false);
    const rotated = new Headers(headers);
    rotated.set(
      "svix-signature",
      `v1,aW52YWxpZA== ${headers.get("svix-signature")}`,
    );
    expect(
      await verifySvix(new TextEncoder().encode(body), rotated, secret, now),
    ).toBe(true);
  });
  it("escapes untrusted listing content and supplies an exact one-click unsubscribe target", () => {
    const result = renderAlert(id, "candidate@example.test", "digest", {
      searchName: "Design <script>alert(1)</script>",
      siteOrigin: "https://westmere.example",
      unsubscribeUrl: `https://ldmwqupidlgrkkjjpcvn.supabase.co/functions/v1/westmere-alerts/unsubscribe?token=${id}`,
      jobs: [
        {
          id,
          title: '<img onerror="bad">',
          company: "Fern & Co",
          location: "Melbourne",
        },
      ],
    });
    expect(result.html).not.toContain("<script>");
    expect(result.html).not.toContain("<img onerror");
    expect(result.html).toContain('alt="Westmere Careers"');
    expect(result.html).toContain("&lt;img");
    expect(result.text).toContain("Fern & Co");
    expect(result.headers["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
    expect(result.headers["List-Unsubscribe"]).toBe(
      `<https://ldmwqupidlgrkkjjpcvn.supabase.co/functions/v1/westmere-alerts/unsubscribe?token=${id}>`,
    );
    expect(() =>
      renderAlert(id, "candidate@example.test", "preview", {
        searchName: "My roles",
        siteOrigin: "https://westmere.example",
        unsubscribeUrl: "https://attacker.example/unsubscribe",
        jobs: [],
      }),
    ).toThrow("INVALID_DESTINATION");
  });
  it("uses bounded backoff and compares dispatch credentials without early character exits", async () => {
    expect(retrySeconds("120", 1)).toBe(120);
    expect(retrySeconds("999999", 1)).toBe(3600);
    expect(retrySeconds("garbage", 2)).toBe(120);
    expect(await sameSecret("one credential", "one credential")).toBe(true);
    expect(await sameSecret("one credential", "other credential")).toBe(false);
  });
});
