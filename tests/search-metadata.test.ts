import { afterEach, expect, it, vi } from "vitest";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import {
  searchIndexingEnabled,
  publicPageMetadata,
} from "@/lib/search-metadata";
const launch = vi.hoisted(() => ({ open: false }));
vi.mock("@/lib/server/launch", () => ({
  marketplaceOpen: async () => launch.open,
}));
afterEach(() => {
  vi.unstubAllEnvs();
  launch.open = false;
});
const production = () => {
  vi.stubEnv("ALLOW_INDEXING", "true");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://westmere.com.au");
};
it("keeps previews, local origins and disabled deployments out of search", () => {
  production();
  expect(searchIndexingEnabled()).toBe(true);
  for (const [key, value] of [
    ["ALLOW_INDEXING", "false"],
    ["VERCEL_ENV", "preview"],
    ["NEXT_PUBLIC_SITE_URL", "http://localhost:3000"],
  ]) {
    production();
    vi.stubEnv(key, value);
    expect(searchIndexingEnabled()).toBe(false);
    expect(
      publicPageMetadata("/launch", "Launch", "Description").robots,
    ).toMatchObject({ index: false });
  }
});
it("lets crawlers reach public launch pages without opening marketplace or account routes", async () => {
  production();
  const result = await robots();
  expect(result.sitemap).toBe("https://westmere.com.au/sitemap.xml");
  expect(result.rules).toMatchObject({
    allow: "/",
    disallow: expect.arrayContaining([
      "/launch/account",
      "/api/",
      "/launch/register",
    ]),
  });
  const urls = (await sitemap()).map((item) => item.url);
  expect(urls).toContain("https://westmere.com.au/launch/employers");
  expect(urls).not.toContain("https://westmere.com.au/launch/account");
  expect(urls).not.toContain("https://westmere.com.au/jobs");
  launch.open = true;
  const opened = (await sitemap()).map((item) => item.url);
  expect(opened).toContain("https://westmere.com.au/");
  expect(opened.some((url) => url.includes("/launch"))).toBe(false);
});
it("provides the same canonical page identity to search and social previews", () => {
  production();
  const result = publicPageMetadata(
    "/launch/employers",
    "Employers",
    "Prepare for launch",
  );
  expect(result.alternates?.canonical).toBe(
    "https://westmere.com.au/launch/employers",
  );
  expect(result.openGraph).toMatchObject({
    url: result.alternates?.canonical,
    locale: "en_AU",
  });
  expect(result.robots).toMatchObject({ index: true, follow: true });
});
it("advertises no URLs when indexing is disabled", async () => {
  production();
  vi.stubEnv("ALLOW_INDEXING", "false");
  expect(await sitemap()).toEqual([]);
  expect((await robots()).rules).toEqual({ userAgent: "*", disallow: "/" });
});
