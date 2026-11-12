import Link from "next/link";
import { ArrowRight } from "lucide-react";
export default function NotFound() {
  return (
    <main id="main" className="container error-boundary">
      <img
        src="/illustrations/new-chapter.svg"
        alt="A little plant growing into a new chapter"
        width={190}
        height={150}
      />
      <h1 style={{ fontSize: 38, marginTop: 20 }}>
        A different path, perhaps.
      </h1>
      <p className="muted">
        This page or opportunity is no longer available. There are more
        possibilities to explore.
      </p>
      <Link className="button primary" href="/jobs">
        Find your next role
        <ArrowRight size={16} />
      </Link>
    </main>
  );
}
