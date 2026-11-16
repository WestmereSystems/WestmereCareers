import { Suspense } from "react";
import { EmployerSignIn } from "@/components/employer-sign-in";
export const metadata = {
  title: "For Employers · Sign in",
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <main id="main" className="business-auth-page">
      <Suspense>
        <EmployerSignIn />
      </Suspense>
    </main>
  );
}
