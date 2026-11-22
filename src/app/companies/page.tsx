import { marketplaceOpen } from "@/lib/server/launch";
import { redirect } from "next/navigation";
import { companyPath } from "@/lib/company-urls";
import { DiscoveryEvent } from "@/components/privacy-choice";
import Link from "next/link";
import { ArrowLeft, ArrowRight, MapPin } from "lucide-react";
import { getCompanies } from "@/lib/companies-server";
export const metadata = { title: "Explore employers" };
export default async function Companies({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string;
    category?: string;
    kind?: string;
  }>;
}) {
  if (!(await marketplaceOpen())) redirect("/launch#candidate-updates");
  const params = await searchParams;
  const requested = Number(params.page || 1);
  const page =
    Number.isInteger(requested) && requested > 0 ? Math.min(requested, 100) : 1;
  const query = typeof params.q === "string" ? params.q.slice(0, 80) : "";
  const category =
    typeof params.category === "string" ? params.category.slice(0, 100) : "";
  const { companies, source, error, total, categories } = await getCompanies(
    page,
    query,
    category,
    ["agency", "employer"].includes(params.kind || "") ? params.kind : "",
  );
  const pages = Math.max(1, Math.ceil(total / 12));
  const pageLink = (next: number) =>
    `/companies?${new URLSearchParams({ page: String(next), ...(query ? { q: query } : {}), ...(category ? { category } : {}), ...(params.kind ? { kind: params.kind } : {}) })}`;
  return (
    <main id="main" className="container">
      <div className="page-intro">
        <p className="eyebrow">The people behind the opportunity</p>
        <h1>Get to know who’s hiring.</h1>
        <p className="muted">
          Explore reviewed employer and recruitment agency profiles and current
          opportunities. Get a clearer picture of the people behind the work.
        </p>
      </div>
      {source === "live" && (
        <DiscoveryEvent
          key={`${page}:${query}:${category}`}
          organisations={companies.map((c) => c.id)}
          kind="search"
          keyword={params.q ? "employer name search" : ""}
        />
      )}
      <div className="page-content">
        <form className="company-search" action="/companies">
          <label className="field-label">
            Employer or agency name
            <input
              type="search"
              name="q"
              maxLength={80}
              defaultValue={query}
              placeholder="Find a company…"
            />
          </label>
          <label className="field-label">
            Hiring category
            <select name="category" defaultValue={category}>
              <option value="">All categories</option>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Advertiser type
            <select name="kind" defaultValue={params.kind || ""}>
              <option value="">Employers and agencies</option>
              <option value="employer">Employers</option>
              <option value="agency">Recruitment agencies</option>
            </select>
          </label>
          <button className="button primary">Search employers</button>
        </form>
        <p className="fineprint company-category-note">
          Categories reflect employers’ and agencies’ currently published roles.
        </p>
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        {!error && !companies.length && (
          <p className="notice" role="status">
            No employers match these filters. Try another name or hiring
            category.
          </p>
        )}
        <div className="company-grid">
          {companies.map((company) => (
            <article
              className="company-card clickable-company-card"
              key={company.id}
            >
              <span className="company-monogram tone-0">{company.name[0]}</span>
              <h2>
                <Link
                  href={companyPath(company.name, company.id)}
                  className="company-primary-link"
                >
                  {company.name}
                  {company.kind === "agency" && " · Recruitment agency"}
                </Link>
              </h2>
              <span className="fineprint">
                {company.is_test
                  ? "Fictional test company"
                  : company.is_verified
                    ? "Business identity checked"
                    : "Fictional preview employer"}
              </span>
              <p>
                {company.description ||
                  "Get to know the people behind your next opportunity."}
              </p>
              <span className="badge">
                <MapPin size={12} />
                {company.is_test
                  ? "Fictional test company"
                  : company.is_verified
                    ? "Verified hiring authority"
                    : "Development preview"}
              </span>
              <div>
                <Link
                  href={companyPath(company.name, company.id)}
                  className="text-link"
                >
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
                href={pageLink(page - 1)}
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
                href={pageLink(page + 1)}
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
