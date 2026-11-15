import Link from "next/link";
import { ArrowLeft, ArrowRight, MapPin } from "lucide-react";
import { getCompanies } from "@/lib/companies-server";
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
  const { companies, source, error, total } = await getCompanies(page);
  const pages = Math.max(1, Math.ceil(total / 12));
  return (
    <main id="main" className="container">
      <div className="page-intro">
        <p className="eyebrow">The people behind the opportunity</p>
        <h1>Get to know who’s hiring.</h1>
        <p className="muted">
          Explore reviewed employer profiles and current opportunities. Get a
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
          {companies.map((company) => (
            <article className="company-card" key={company.id}>
              <span className="company-monogram tone-0">{company.name[0]}</span>
              <h2>{company.name}</h2>
              <span className="fineprint">
                {company.is_verified
                  ? "Business identity checked"
                  : "Fictional preview employer"}
              </span>
              <p>
                {company.description ||
                  "Get to know the people behind your next opportunity."}
              </p>
              <span className="badge">
                <MapPin size={12} />
                {company.is_verified
                  ? "Verified hiring authority"
                  : "Development preview"}
              </span>
              <div>
                <Link href={`/companies/${company.id}`} className="text-link">
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
              Page {page} of {pages} · {total} employer profiles
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
