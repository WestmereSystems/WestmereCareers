import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
const route = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
import Loading from "../src/app/loading";
describe("route loading boundaries", () => {
  it("uses homepage-shaped placeholders only for the home route", () => {
    route.pathname = "/";
    const html = renderToStaticMarkup(createElement(Loading));
    expect(html).toContain('class="hero-grid"');
    expect(html).toContain('class="home-loading-search"');
    expect(html).not.toContain('class="loading-card"');
  });
  it("preserves the existing three-card skeleton for other routes", () => {
    for (const pathname of [
      "/jobs",
      "/studio",
      "/account",
      "/companies/example",
    ]) {
      route.pathname = pathname;
      const html = renderToStaticMarkup(createElement(Loading));
      expect(html.match(/class="loading-card"/g)).toHaveLength(3);
      expect(html).toContain("Your next chapter is loading…");
      expect(html).not.toContain("home-loading");
    }
  });
});
