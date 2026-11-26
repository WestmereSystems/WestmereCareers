import { publicPageMetadata } from "@/lib/search-metadata";
import { redirect } from "next/navigation";
import { marketplaceOpen } from "@/lib/server/launch";
import { FoundingHome } from "./_components/founding-launch";

export const metadata = publicPageMetadata(
  "/launch",
  "Australian careers marketplace — founding launch",
  "Westmere Careers is preparing an Australian jobs marketplace. Employers and agencies can register, verify their business and prepare for public launch.",
);
export default async function Page() {
  if (await marketplaceOpen()) redirect("/");
  return <FoundingHome />;
}
