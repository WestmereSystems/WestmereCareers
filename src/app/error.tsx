"use client";
import { RefreshCcw } from "lucide-react";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="container error-boundary">
      <h1 style={{ fontSize: 35 }}>Let’s give that another go.</h1>
      <p className="muted">
        Something interrupted this page. Your existing applications haven’t been
        changed.
      </p>
      <button className="button primary" onClick={reset}>
        <RefreshCcw size={16} />
        Try again
      </button>
    </main>
  );
}
