import { marketplaceOpen } from "@/lib/server/launch";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { CareersPlus } from "@/components/premium-pages";

export const metadata: Metadata = {
  title: "Careers+ — Your Careers+ Studio",
  description:
    "Personal CV guidance, thoughtful application tailoring and a clearer view of your strengths. Careers+ costs A$25 per month.",
};

export default async function CareersPlusPage() {
  if (!(await marketplaceOpen())) redirect("/launch/careers-plus");
  return <CareersPlus />;
}
