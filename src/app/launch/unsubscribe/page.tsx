import { Suspense } from "react";
import { LaunchUnsubscribe } from "@/components/launch-unsubscribe";
export const metadata = {
  title: "Launch email preferences",
  robots: { index: false, follow: false },
};
export default function Page() {
  return (
    <main id="main" className="container page-content">
      <section className="panel">
        <h1>Launch email preferences.</h1>
        <Suspense fallback={<p>Loading preferences…</p>}>
          <LaunchUnsubscribe />
        </Suspense>
      </section>
    </main>
  );
}
