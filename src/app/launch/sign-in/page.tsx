import { Suspense } from "react";
import { redirect } from "next/navigation";
import { marketplaceOpen } from "@/lib/server/launch";
import { EmployerSignIn } from "@/components/employer-sign-in";
import { routeQuery } from "@/lib/launch-paths";

export const metadata = {
  title: "Business sign in",
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (await marketplaceOpen())
    redirect(`/employers/sign-in${routeQuery(await searchParams)}`);
  return (
    <main id="main" className="business-auth-page">
      <Suspense>
        <EmployerSignIn />
      </Suspense>
    </main>
  );
}
