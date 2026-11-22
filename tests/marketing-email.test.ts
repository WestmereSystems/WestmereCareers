import { expect, it } from "vitest";
import { renderMarketingEmail } from "../supabase/functions/_shared/marketing-email";
const id = "92000000-0000-4000-8000-000000000001";
const snapshot = {
  company: "Y Victoria",
  subject: "An employer invitation for Y Victoria",
  greeting: "Hi Y Victoria procurement team,",
  paragraphs: [
    "Your website invites prospective suppliers to introduce their services.",
    "I’m Louis from Westmere Careers.",
  ],
  siteOrigin: "https://westmere.com.au",
  unsubscribeUrl: `https://westmere.com.au/marketing/unsubscribe?token=${id}`,
  purpose: "supplier_introduction" as const,
};
it("provides a bottom unsubscribe button, plain-text fallback and RFC 8058 headers", () => {
  const message = renderMarketingEmail(id, "procurement@example.org", snapshot);
  expect(message.html).toContain(">Unsubscribe from marketing</a>");
  expect(
    message.html.lastIndexOf(snapshot.unsubscribeUrl.replaceAll("&", "&amp;")),
  ).toBeGreaterThan(message.html.indexOf("ABN 16 319 214 903"));
  expect(message.html).toContain("/launch/employers");
  expect(message.html).toContain(">Louis</p>");
  expect(message.headers["List-Unsubscribe-Post"]).toBe(
    "List-Unsubscribe=One-Click",
  );
  expect(message.headers["List-Unsubscribe"]).toContain(
    "/api/marketing/unsubscribe?token=",
  );
  expect(message.text).toContain(snapshot.unsubscribeUrl);
});
it("escapes HTML and rejects wrong-domain, malformed and injected links and subjects", () => {
  expect(
    renderMarketingEmail(id, "recipient@example.org", {
      ...snapshot,
      paragraphs: ["<script>alert('unsafe')</script>"],
    }).html,
  ).toContain("&lt;script&gt;");
  for (const unsubscribeUrl of [
    "https://unrelated.example/marketing/unsubscribe?token=" + id,
    "https://westmere.com.au/marketing/unsubscribe?token=wrong",
    snapshot.unsubscribeUrl + "&email=another@example.org",
    snapshot.unsubscribeUrl + "#secret",
  ])
    expect(() =>
      renderMarketingEmail(id, "recipient@example.org", {
        ...snapshot,
        unsubscribeUrl,
      }),
    ).toThrow();
  expect(() =>
    renderMarketingEmail(id, "recipient@example.org", {
      ...snapshot,
      subject: "Hello\r\nBcc: other@example.org",
    }),
  ).toThrow();
});
