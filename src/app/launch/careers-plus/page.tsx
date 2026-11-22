import { redirect } from "next/navigation";
import { marketplaceOpen } from "@/lib/server/launch";
import { CareersPlus } from "@/components/premium-pages";

export const metadata = { title: "Careers+ — Your Careers+ Studio" };
export default async function Page() {
  if (await marketplaceOpen()) redirect("/careers-plus");
  return <CareersPlus />;
}
