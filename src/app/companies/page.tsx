import Link from "next/link";
import { ArrowLeft, ArrowRight, MapPin } from "lucide-react";
import { getPublicJobs } from "@/lib/jobs-server";
export const metadata = { title: "Explore employers" };
export default async function Companies({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const requested = Number(params.page || 1);
  const page =
    Number.isInteger(requested) && requested > 0 ? Math.min(requested, 100) : 1;
  const { jobs, source, error, total, pageSize } = await getPublicJobs({
    page,
    pageSize: 12,
  });
  const companies = [
    ...new Map(jobs.map((job) => [job.company, job])).values(),
  ];
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <main id="main" className="container">
      <div className="page-intro">
        <p className="eyebrow">The people behind the opportunity</p>
        <h1>Get to know who’s hiring.</h1>
        <p className="muted">
          Meet employers with opportunities in our current results, and get a
          clearer picture of the people behind the work.
        </p>
      </div>
      <div className="page-content">
        {source === "demo" && (
          <p className="demo-note">
            <span />
            Fictional employers and sample insights for this development
            preview.
          </p>
        )}
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        <div className="company-grid">
          {companies.map((job) => (
            <article className="company-card" key={job.company}>
              <span className="company-monogram tone-0">
                {job.companyInitial}
              </span>
              <h2>{job.company}</h2>
              <span className="fineprint">
                {job.category} · {job.companySize}
              </span>
              <p>{job.companyDescription}</p>
              <span className="badge">
                <MapPin size={12} />
                {job.city}
              </span>
              <div>
                <Link href={`/companies/${job.id}`} className="text-link">
                  Meet the employer
                  <ArrowRight size={15} />
                </Link>
              </div>
            </article>
          ))}
        </div>
        {!error && pages > 1 && (
          <nav
            className="actions-row"
            aria-label="Employer discovery pages"
            style={{ marginTop: 25 }}
          >
            {page > 1 ? (
              <Link
                className="button secondary small"
                href={`/companies?page=${page - 1}`}
              >
                <ArrowLeft size={15} />
                Previous
              </Link>
            ) : (
              <span />
            )}
            <span className="fineprint">
              Page {page} of {pages} · Employers from {total} current roles
            </span>
            {page < pages ? (
              <Link
                className="button secondary small"
                href={`/companies?page=${page + 1}`}
              >
                Next
                <ArrowRight size={15} />
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
      </div>
    </main>
  );
}
