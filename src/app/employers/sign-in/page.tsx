import { redirect } from "next/navigation";
import { marketplaceOpen } from "@/lib/server/launch";
import { routeQuery } from "@/lib/launch-paths";
import { Suspense } from "react";
import { EmployerSignIn } from "@/components/employer-sign-in";
export const metadata = {
  title: "For Employers · Sign in",
  robots: { index: false, follow: false },
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!(await marketplaceOpen()))
    redirect(`/launch/sign-in${routeQuery(await searchParams)}`);
  return (
    <main id="main" className="business-auth-page">
      <Suspense>
        <EmployerSignIn />
      </Suspense>
    </main>
  );
}
