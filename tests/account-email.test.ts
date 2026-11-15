import { describe, it, expect } from "vitest";
import { renderAccountEmail } from "../supabase/functions/_shared/account-email";
const id = "10000000-0000-4000-8000-000000000001";
describe("account service emails", () => {
  it("brands account updates without CV content or job-alert unsubscribe semantics", () => {
    const email = renderAccountEmail(id, "candidate@example.test", {
      title: "Application <updated>",
      message: "Sign in & review your update.",
      siteOrigin: "https://westmere.example",
      path: "/applications",
    });
    expect(email.html).toContain('alt="Westmere Careers"');
    expect(email.html).toContain("&lt;updated&gt;");
    expect(email.html).toContain("https://westmere.example/privacy");
    expect(email).not.toHaveProperty("headers.List-Unsubscribe");
    expect(email.tags[1].value).toBe(id);
  });
  it("refuses arbitrary destinations and paths", () => {
    expect(() =>
      renderAccountEmail(id, "candidate@example.test", {
        title: "Update",
        message: "Update",
        siteOrigin: "http://unsafe.example",
        path: "/applications",
      }),
    ).toThrow();
    expect(() =>
      renderAccountEmail(id, "candidate@example.test", {
        title: "Update",
        message: "Update",
        siteOrigin: "https://westmere.example",
        path: "//attacker.example",
      }),
    ).toThrow();
  });
});
