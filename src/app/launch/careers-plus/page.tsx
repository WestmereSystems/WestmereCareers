import { publicPageMetadata } from "@/lib/search-metadata";
import { redirect } from "next/navigation";
import { marketplaceOpen } from "@/lib/server/launch";
import { CareersPlus } from "@/components/premium-pages";

export const metadata = publicPageMetadata(
  "/launch/careers-plus",
  "Careers+ Studio for Australian job seekers",
  "Explore Westmere Careers’ optional Careers+ Studio for CV guidance and tailored applications. Job seeker subscriptions open with the public marketplace.",
);
export default async function Page() {
  if (await marketplaceOpen()) redirect("/careers-plus");
  return <CareersPlus />;
}
