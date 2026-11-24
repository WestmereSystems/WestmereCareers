import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("@/components/providers", () => ({
  useSession: mocks.session,
  ThemeToggle: () => null,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/launch",
  useSearchParams: () => new URLSearchParams(),
}));
import { Footer } from "../src/components/shell";
const defaults = {
  loading: false,
  marketplaceOpen: false,
  user: null,
  business: null,
  isPremium: false,
  staffRole: null,
};
const render = (overrides: Record<string, unknown> = {}) => {
  mocks.session.mockReturnValue({ ...defaults, ...overrides });
  return renderToStaticMarkup(createElement(Footer));
};
function destinations(html: string) {
  return [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>/g)].map(
    (match) => match[1],
  );
}
beforeEach(() => vi.clearAllMocks());
describe("footer navigation for the available account experience", () => {
  it("offers public pre-launch actions without applicant or private workspace links to guests", () => {
    const html = render();
    const links = destinations(html);
    expect(links).toEqual(
      expect.arrayContaining([
        "/launch#candidate-updates",
        "/launch/register",
        "/launch/sign-in",
        "/launch/employers",
        "/launch/plans",
      ]),
    );
    expect(links).not.toContain("/jobs");
    expect(links).not.toContain("/companies");
    expect(
      links.some(
        (href) =>
          href.startsWith("/account") || href.startsWith("/launch/account"),
      ),
    ).toBe(false);
  });
  it.each(["employer", "agency"])(
    "shows the %s workspace rather than unsupported applicant tabs",
    (kind) => {
      const html = render({
        user: { id: "business-owner" },
        business: { kind },
      });
      const links = destinations(html);
      for (const tab of [
        "profile",
        "roles",
        "launch",
        "applicants",
        "dashboard",
      ])
        expect(links).toContain(`/launch/account?tab=${tab}`);
      for (const tab of ["saved", "alerts", "applications", "trust"])
        expect(links.some((href) => href.endsWith(`tab=${tab}`))).toBe(false);
      expect(links).not.toContain("/launch#candidate-updates");
    },
  );
  it("retains valid candidate history and saved-search links for an existing pre-launch applicant", () => {
    const links = destinations(render({ user: { id: "existing-applicant" } }));
    for (const tab of ["profile", "applications", "saved", "alerts", "trust"])
      expect(links).toContain(`/launch/account?tab=${tab}`);
    expect(links).toContain("/launch#candidate-updates");
  });
  it("uses the normal marketplace routes once launch opens", () => {
    const guest = destinations(render({ marketplaceOpen: true }));
    expect(guest).toEqual(
      expect.arrayContaining([
        "/jobs",
        "/companies",
        "/saved",
        "/account",
        "/employers#plans",
      ]),
    );
    expect(guest.some((href) => href.startsWith("/launch"))).toBe(false);
    const business = destinations(
      render({
        marketplaceOpen: true,
        user: { id: "owner" },
        business: { kind: "employer" },
      }),
    );
    expect(business).toContain("/account?tab=roles");
    expect(business.some((href) => href.includes("tab=launch"))).toBe(false);
  });
  it.each([
    { user: null, isPremium: false, expected: false },
    { user: { id: "free-applicant" }, isPremium: false, expected: false },
    {
      user: { id: "invited-business-user" },
      business: { kind: "employer" },
      isPremium: false,
      expected: false,
    },
    { user: { id: "member" }, isPremium: true, expected: true },
    {
      user: { id: "enterprise-owner" },
      business: { kind: "agency" },
      isPremium: true,
      expected: true,
    },
  ])(
    "matches Studio navigation to the account entitlement ($expected)",
    ({ expected, ...session }) => {
      const links = destinations(render(session));
      expect(links.includes("/studio")).toBe(expected);
      expect(links.includes("/launch/careers-plus")).toBe(!expected);
    },
  );
  it.each(["reviewer", "admin"])(
    "gives %s staff the actual Admin tab in founding mode",
    (staffRole) => {
      const links = destinations(render({ user: { id: "staff" }, staffRole }));
      expect(links).toContain("/launch/account?tab=admin");
      expect(links).not.toContain("/admin");
    },
  );
  it("keeps one link per policy and includes the official contact destinations", () => {
    const html = render();
    const links = destinations(html);
    for (const href of ["/terms", "/privacy", "/transparency"])
      expect(links.filter((link) => link === href)).toHaveLength(1);
    expect(links).toContain("mailto:hello@westmere.com.au");
    expect(html).toMatch(
      /href="https:\/\/www.linkedin.com\/company\/westmerecareers"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/,
    );
    expect(html).toContain("Privacy &amp; analytics choices");
  });
});
