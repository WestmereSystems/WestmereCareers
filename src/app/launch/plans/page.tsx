import { redirect } from "next/navigation";
import { marketplaceOpen } from "@/lib/server/launch";
import { LaunchPlans } from "../_components/launch-plans";
export const metadata = { title: "Employer and agency plans" };
export default async function Page() {
  if (await marketplaceOpen()) redirect("/employers#plans");
  return <LaunchPlans />;
}
