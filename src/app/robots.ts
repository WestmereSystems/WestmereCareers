import type { MetadataRoute } from "next";
import { marketplaceOpen } from "@/lib/server/launch";

export const dynamic = "force-dynamic";
export default async function robots(): Promise<MetadataRoute.Robots> {
  const enabled =
    process.env.ALLOW_INDEXING === "true" && (await marketplaceOpen());
  return {
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
          ],
        }
      : { userAgent: "*", disallow: "/" },
  };
}
