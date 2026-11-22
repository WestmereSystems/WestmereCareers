import { redirect } from "next/navigation";
import { marketplaceOpen } from "@/lib/server/launch";
import { routeQuery } from "@/lib/launch-paths";
import { AccountPage } from "@/components/account-page";
export const metadata = {
  title: "Profile",
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await marketplaceOpen()))
    redirect(`/launch/account${routeQuery(await searchParams)}`);
  return <AccountPage />;
}
