import { describe, it, expect } from "vitest";
import { renderAccountEmail } from "../supabase/functions/_shared/account-email";
const id = "10000000-0000-4000-8000-000000000001";
describe("account service emails", () => {
  it("delivers billing confirmations with a link back to the private billing tab", () => {
    const email = renderAccountEmail(id, "candidate@example.test", {
      title: "Careers+ subscription confirmed",
      message: "Sign in to review your billing update.",
      siteOrigin: "https://westmere.example",
      path: "/account?tab=billing",
    });
    expect(email.text).toContain(
      "https://westmere.example/account?tab=billing",
    );
  });
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

it("renders business invitations with a safe direct link to the team menu", () => {
  const email = renderAccountEmail(
    "60000000-0000-4000-8000-000000000001",
    "new@example.test",
    {
      title: "Join Example",
      message: "Accept within seven days.",
      siteOrigin: "https://careers.example.test",
      path: "/account?tab=team",
    },
  );
  expect(email.text).toContain("https://careers.example.test/account?tab=team");
  expect(email.to).toEqual(["new@example.test"]);
});
