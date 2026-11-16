import { Suspense } from "react";
import { EmployerPreview } from "@/components/employer-preview";
export const metadata = {
  title: "Preview your hiring dashboard",
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <main id="main" className="container page-content">
      <Suspense>
        <EmployerPreview />
      </Suspense>
    </main>
  );
}
