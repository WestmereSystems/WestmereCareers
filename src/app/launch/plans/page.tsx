import { publicPageMetadata } from "@/lib/search-metadata";
import { redirect } from "next/navigation";
import { marketplaceOpen } from "@/lib/server/launch";
import { LaunchPlans } from "../_components/launch-plans";
export const metadata = publicPageMetadata(
  "/launch/plans",
  "Employer and recruitment agency plans",
  "Compare Westmere Careers employer and recruitment agency plans, including job advertising, team access and optional monthly subscriptions in Australia.",
);
export default async function Page() {
  if (await marketplaceOpen()) redirect("/employers#plans");
  return <LaunchPlans />;
}
