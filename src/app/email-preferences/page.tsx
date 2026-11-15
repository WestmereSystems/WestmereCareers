import { Suspense } from "react";
import { EmailPreferences } from "@/components/email-preferences";
export const metadata = {
  title: "Email preferences",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default function Page() {
  return (
    <main id="main" className="container section">
      <Suspense fallback={<p>Loading preferences…</p>}>
        <EmailPreferences />
      </Suspense>
    </main>
  );
}
