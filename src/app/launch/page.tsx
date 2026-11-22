import { redirect } from "next/navigation";
import { marketplaceOpen } from "@/lib/server/launch";
import { FoundingHome } from "./_components/founding-launch";

export const metadata = {
  title: "Australia-wide founding launch",
  description:
    "Register your business or agency, complete verification and prepare privately for Westmere Careers’ public launch.",
};
export default async function Page() {
  if (await marketplaceOpen()) redirect("/");
  return <FoundingHome />;
}
