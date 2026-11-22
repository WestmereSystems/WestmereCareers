import { redirect } from "next/navigation";
import { marketplaceOpen } from "@/lib/server/launch";
import { FoundingEmployerPage } from "../_components/founding-launch";

export const metadata = { title: "Prepare your business for launch" };
export default async function Page() {
  if (await marketplaceOpen()) redirect("/employers");
  return <FoundingEmployerPage />;
}
