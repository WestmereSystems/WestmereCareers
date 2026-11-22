import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), redirect: vi.fn() }));
vi.mock("@/components/providers", () => ({
  useSession: mocks.session,
  ThemeToggle: () => null,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/studio",
  useSearchParams: () => new URLSearchParams(),
  redirect: mocks.redirect,
}));
vi.mock("@/components/career-assistant", () => ({
  CareerChat: () => createElement("div", null, "Conversation workspace"),
}));
import {
  CareersPlus,
  ApplicationStudio,
} from "../src/components/premium-pages";
import { Header } from "../src/components/shell";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockReturnValue({
    loading: false,
    marketplaceOpen: true,
    user: { id: "member", fullName: "Test" },
    isPremium: true,
    business: null,
    savedIds: [],
  });
  mocks.redirect.mockImplementation(() => {
    throw Error("Redirect to Studio");
  });
});
describe("Careers+ member navigation", () => {
  it("opens the Studio for an existing signed-in member", () => {
    expect(() => renderToStaticMarkup(createElement(CareersPlus))).toThrow(
      "Redirect to Studio",
    );
    expect(mocks.redirect).toHaveBeenCalledWith("/studio");
    const html = renderToStaticMarkup(createElement(Header));
    expect(html).toMatch(/href="\/studio"[^>]*>Careers<span>\+<\/span> Studio/);
  });
  it("does not redirect a guest or free account into member marketing behavior", () => {
    for (const session of [
      { loading: false, user: null, isPremium: false },
      { loading: false, user: { id: "free" }, isPremium: false },
    ]) {
      mocks.session.mockReturnValue(session);
      expect(renderToStaticMarkup(createElement(CareersPlus))).toContain(
        "100 Assistant requests",
      );
    }
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("gives members a named full-width workspace without the second output panel", () => {
    const html = renderToStaticMarkup(
      createElement(ApplicationStudio, { jobs: [], isDemoInventory: false }),
    );
    expect(html).toContain("Your Careers+ Studio.");
    expect(html).toContain("studio-workspace");
    expect(html).not.toContain("Room for your next chapter");
    expect(html).not.toContain("Prepare for a listed role");
    expect(html).toContain("Westmere Assistant");
    expect(html).toContain("Role Strength");
  });
});

it("opens Studio for Enterprise billing owners but not invited non-members", () => {
  const session = mocks.session();
  mocks.session.mockReturnValue({ ...session, business: { kind: "employer" } });
  expect(() => renderToStaticMarkup(createElement(CareersPlus))).toThrow(
    "Redirect to Studio",
  );
  const html = renderToStaticMarkup(createElement(Header));
  expect(html.replace(/<[^>]*>/g, "")).toContain("Careers+ Studio");
  mocks.session.mockReturnValue({
    ...session,
    isPremium: false,
    business: { kind: "employer" },
  });
  expect(
    renderToStaticMarkup(createElement(Header)).replace(/<[^>]*>/g, ""),
  ).not.toContain("Careers+ Studio");
});
