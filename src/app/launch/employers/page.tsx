import { publicPageMetadata } from "@/lib/search-metadata";
import { redirect } from "next/navigation";
import { marketplaceOpen } from "@/lib/server/launch";
import { FoundingEmployerPage } from "../_components/founding-launch";

export const metadata = publicPageMetadata(
  "/launch/employers",
  "Employer registration for the Australian founding launch",
  "Register your business or recruitment agency with Westmere Careers. Complete verification and prepare your profile and vacancies before public launch.",
);
export default async function Page() {
  if (await marketplaceOpen()) redirect("/employers");
  return <FoundingEmployerPage />;
}
