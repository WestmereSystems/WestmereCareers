import { Suspense } from "react";
import { SavedSearches } from "@/components/saved-searches";
export const metadata = { title: "Saved searches & job alerts" };
export default function Page() {
  return (
    <main id="main" className="container page-content">
      <div className="page-intro">
        <p className="eyebrow">Good possibilities, kept close</p>
        <h1>A search worth coming back to.</h1>
        <p>
          Save your filters. Choose a gentle daily or weekly email when new
          roles match.
        </p>
      </div>
      <Suspense fallback={<p>Loading your search…</p>}>
        <SavedSearches />
      </Suspense>
    </main>
  );
}
