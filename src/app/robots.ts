import type { MetadataRoute } from "next";
import { searchIndexingEnabled, SITE_ORIGIN } from "@/lib/search-metadata";

export const dynamic = "force-dynamic";
export default async function robots(): Promise<MetadataRoute.Robots> {
  const enabled = searchIndexingEnabled();
  return {
    ...(enabled ? { sitemap: `${SITE_ORIGIN}/sitemap.xml` } : {}),
    rules: enabled
      ? {
          userAgent: "*",
          allow: "/",
          disallow: [
            "/api/",
            "/account",
            "/admin",
            "/auth/",
            "/profile",
            "/applications",
            "/marketing/unsubscribe",
            "/launch/unsubscribe",
            "/email-preferences",
            "/employers/sample",
            "/employers/preview",
            "/employers/sign-in",
            "/launch/account",
            "/launch/register",
            "/launch/sign-in",
            "/studio",
          ],
        }
      : { userAgent: "*", disallow: "/" },
  };
}
