import type { Metadata } from "next";
import { JobBrowser } from "@/components/job-browser";
import { getPublicJobs, parseJobQuery } from "@/lib/jobs-server";

export const metadata: Metadata = {
  title: "Find your next role",
  description:
    "Explore Australian roles with clear pay, flexible filters and candidate-reported employer response insights.",
};
export const dynamic = "force-dynamic";

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supplied = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(supplied))
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item));
    else if (value !== undefined) params.set(key, value);
  const query = parseJobQuery(params);
  const result = await getPublicJobs(query);
  return (
    <main id="main">
      <div className="container">
        <section className="page-intro">
          <p className="eyebrow">A world of possibility</p>
          <h1>Find your next chapter.</h1>
          <p className="muted">
            Clear pay, thoughtful filters and a better picture of who’s hiring.
            Let’s find work that feels right for you.
          </p>
        </section>
        <section className="page-content" aria-label="Search and explore roles">
          <JobBrowser
            key={JSON.stringify(query)}
            initialJobs={result.jobs}
            source={result.source}
            initialKeyword={query.keyword}
            initialLocation={query.location}
            initialSort={query.sort}
            initialTotal={result.total}
            initialPage={result.page}
            initialError={result.error}
            initialWorkMode={query.workMode}
            initialEmploymentType={query.employmentType}
            initialMinSalary={query.minSalary}
            initialDirectOnly={query.directOnly}
          />
        </section>
      </div>
    </main>
  );
}
