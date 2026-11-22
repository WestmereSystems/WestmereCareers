import { marketplaceOpen } from "@/lib/server/launch";
import { redirect } from "next/navigation";
import { EmployerMarketing } from "@/components/employer-marketing";
export const metadata = { title: "For employers" };
export default async function Employers() {
  if (!(await marketplaceOpen())) redirect("/launch/employers");
  return (
    <main id="main" className="container employer-marketing">
      <EmployerMarketing />
    </main>
  );
}
