import type { Metadata } from "next";

export const SITE_ORIGIN = "https://westmere.com.au";
export function searchIndexingEnabled(env = process.env): boolean {
  return (
    env.ALLOW_INDEXING === "true" &&
    env.VERCEL_ENV === "production" &&
    env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") === SITE_ORIGIN
  );
}
export const launchSearchPaths = [
  "/launch",
  "/launch/employers",
  "/launch/plans",
  "/launch/careers-plus",
] as const;
export const informationSearchPaths = [
  "/about",
  "/privacy",
  "/terms",
  "/transparency",
] as const;
export function publicPageMetadata(
  path: string,
  title: string,
  description: string,
): Metadata {
  const url = new URL(path, SITE_ORIGIN).href;
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: searchIndexingEnabled(), follow: true },
    openGraph: {
      type: "website",
      locale: "en_AU",
      siteName: "Westmere Careers",
      title,
      description,
      url,
    },
    twitter: { card: "summary", title, description },
  };
}
