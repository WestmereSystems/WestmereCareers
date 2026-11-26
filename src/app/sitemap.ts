import type { MetadataRoute } from "next";
import { marketplaceOpen } from "@/lib/server/launch";
import {
  informationSearchPaths,
  launchSearchPaths,
  searchIndexingEnabled,
  SITE_ORIGIN,
} from "@/lib/search-metadata";

export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!searchIndexingEnabled()) return [];
  const paths = (await marketplaceOpen())
    ? ["/", "/employers", "/careers-plus", ...informationSearchPaths]
    : [...launchSearchPaths, ...informationSearchPaths];
  return paths.map((path) => ({ url: new URL(path, SITE_ORIGIN).href }));
}
