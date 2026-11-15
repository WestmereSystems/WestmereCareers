import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, MessageCircle } from "lucide-react";
import { getCompany } from "@/lib/companies-server";
import { JobCard } from "@/components/job-card";
import {
  ResponseReportForm,
  TrustCaseForm,
} from "@/components/trust-workflows";
export default async function Company({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { company, jobs, insight, source, error } = await getCompany(id);
  if (error && !company)
    return (
      <main id="main" className="container section">
        <p className="notice" role="alert">
          {error}
        </p>
      </main>
    );
  if (!company) notFound();
  const enough =
    insight?.eligible_reports !== null &&
    insight?.eligible_reports !== undefined;
  return (
    <main id="main" className="container page-intro page-content">
      <nav className="breadcrumbs">
        <Link href="/companies">
          <ArrowLeft size={12} />
          Explore employers
        </Link>
      </nav>
      {source === "demo" && (
        <p className="demo-note">
          <span />
          Fictional employer · Sample response data.
        </p>
      )}
      <div className="detail-grid">
        <article className="detail-card">
          <span
            className="company-monogram tone-0"
            style={{ width: 60, height: 60, fontSize: 32, marginBottom: 20 }}
          >
            {company.name[0]}
          </span>
          <p className="eyebrow">Meet the employer</p>
          <h1 style={{ fontSize: 38 }}>{company.name}</h1>
          <p style={{ marginTop: 14 }}>
            {company.is_verified && !company.suspended_at
              ? "Business identity and hiring authority checked"
              : company.suspended_at
                ? "Hiring access suspended pending review"
                : "Business verification not complete"}
          </p>
          <h2>A little about us</h2>
          <p>
            {company.description ||
              "This employer has not added an introduction yet."}
          </p>
          <p className="fineprint">
            Business verification is not an endorsement of workplace quality or
            a guarantee about a role.
          </p>
          <h2>What candidates have reported</h2>
          {insight?.is_unresponsive && enough && (
            <p className="notice">
              Unresponsive · More than half of eligible candidates reported no
              meaningful response after two calendar months.
            </p>
          )}
          <p>
            These reports describe individual experiences. They may not
            represent every applicant or predict the outcome of your
            application.
          </p>
          <div className="company-stats">
            <div>
              <span>Median first response among responders</span>
              <strong>
                {enough && insight?.median_response_days !== null
                  ? `${insight?.median_response_days} days`
                  : "Not enough data"}
              </strong>
              <span>
                {enough ? insight?.response_reports : "Insufficient recent"}{" "}
                reports with a response
              </span>
            </div>
            <div>
              <span>No response reported after 2 months</span>
              <strong>
                {enough
                  ? `${insight?.no_response_reports} / ${insight?.eligible_reports}`
                  : "Not enough data"}
              </strong>
              <span>Eligible candidate reports</span>
            </div>
          </div>
          <p className="fineprint">
            {source === "demo"
              ? "Illustrative cohort: applications submitted three to six months ago. These figures are fictional."
              : "Response figures are shown only where sufficient reporting evidence is available."}{" "}
            Two months means two calendar months. Receipts and application opens
            are not meaningful employer responses.
          </p>
          <Link
            href="/transparency"
            className="text-link"
            style={{ marginTop: 20 }}
          >
            Read the reporting methodology
            <ArrowRight size={16} />
          </Link>
          {insight && (
            <p className="fineprint">
              Application cohort: {insight.period_start} to {insight.period_end}{" "}
              (end excluded), Australia/Melbourne. Updated{" "}
              {new Date(insight.as_of).toLocaleDateString("en-AU")}.
            </p>
          )}
          <p className="fineprint">
            At least 10 unique eligible candidates are required, with five
            responders for a median. Silence must be reconfirmed within 30 days.
            Snapshots older than 24 hours are hidden until refreshed.
          </p>
          {source === "live" && (
            <>
              <ResponseReportForm organisationId={company.id} />
              <TrustCaseForm organisationId={company.id} />
            </>
          )}
          <h2>A more considered application</h2>
          <p>
            Review the role’s requirements and use your own experience to show
            why the opportunity interests you. Ask about the team’s process and
            expected update dates.
          </p>
        </article>
        <aside>
          <p className="eyebrow" style={{ marginBottom: 15 }}>
            An opportunity with this employer
          </p>
          {!jobs.length && (
            <p className="panel">No current roles with this employer.</p>
          )}
          {jobs.map((job) => (
            <JobCard job={job} key={job.id} />
          ))}
          <div className="notice" style={{ marginTop: 20 }}>
            <MessageCircle size={18} />
            <p>
              Candidate reports and recorded application activity are different
              signals. We label each clearly.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}
