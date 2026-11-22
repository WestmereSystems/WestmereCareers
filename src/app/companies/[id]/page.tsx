import { DiscoveryEvent } from "@/components/privacy-choice";
import { BusinessLinks } from "@/components/business-profile";
import Link from "next/link";
import { ContactEmail } from "@/components/contact-email";
import { RichText } from "@/components/rich-text";
import { companyPath } from "@/lib/company-urls";
import { notFound, permanentRedirect } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  MessageCircle,
  CircleCheck,
} from "lucide-react";
import { getCompany } from "@/lib/companies-server";
import { JobCard } from "@/components/job-card";
import { ResponseReportForm } from "@/components/trust-workflows";
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
  const canonicalPath = companyPath(company.name, company.id);
  if (`/companies/${id}` !== canonicalPath) permanentRedirect(canonicalPath);
  const enough =
    insight?.eligible_reports !== null &&
    insight?.eligible_reports !== undefined;
  return (
    <main id="main" className="container page-intro page-content">
      {source === "live" && (
        <DiscoveryEvent organisations={[company.id]} kind="profile" />
      )}
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
          {company.banner_path && (
            <img
              className="employer-banner"
              src={`/api/employer-image?id=${company.id}&kind=banner`}
              alt=""
              width="1200"
              height="400"
            />
          )}
          <span
            className="company-monogram tone-0"
            style={{ width: 60, height: 60, fontSize: 32, marginBottom: 20 }}
          >
            {company.avatar_path ? (
              <img
                src={`/api/employer-image?id=${company.id}&kind=avatar`}
                alt=""
                width="60"
                height="60"
              />
            ) : (
              company.name[0]
            )}
          </span>
          <p className="eyebrow">
            {company.kind === "agency"
              ? "Meet the recruitment agency"
              : "Meet the employer"}
          </p>
          <h1 style={{ fontSize: 38 }}>{company.name}</h1>
          <p className="business-verification-status" style={{ marginTop: 14 }}>
            {!company.is_test &&
              company.is_verified &&
              !company.suspended_at && (
                <CircleCheck
                  size={19}
                  className="business-verified-icon"
                  aria-hidden="true"
                />
              )}
            {company.is_test
              ? "Fictional company for application testing · not a real employer"
              : company.is_verified && !company.suspended_at
                ? "Business identity and hiring authority checked"
                : company.suspended_at
                  ? "Hiring access suspended pending review"
                  : "Business verification not complete"}
          </p>
          <BusinessLinks
            website={company.website}
            links={company.social_links}
          />
          {company.kind === "agency" && (
            <p className="notice">
              {company.is_test
                ? "Fictional test recruitment agency"
                : "Reviewed recruitment agency"}
              <br />
              Specialisms:{" "}
              {company.agency_specialisms?.join(", ") || "Not listed"}
              <br />
              Service regions:{" "}
              {company.agency_regions?.join(", ") || "Not listed"}
            </p>
          )}
          <h2>A little about us</h2>
          <RichText
            text={
              company.description ||
              "This employer has not added an introduction yet."
            }
          />
          <p className="fineprint">
            Business verification is not an endorsement of workplace quality or
            a guarantee about a role.
          </p>
          {company.careers_email && (
            <ContactEmail
              email={company.careers_email}
              label="Careers enquiries"
            />
          )}
          <h2>Application response insights</h2>
          {insight?.is_unresponsive && enough && (
            <p className="notice">
              Unresponsive · More than half of eligible candidates had no
              meaningful response after two calendar months.
            </p>
          )}
          <p>
            On-site applications use recorded employer updates and decisions.
            Off-site applications use candidate-reported experiences. These
            figures do not predict the outcome of your application.
          </p>
          <div className="company-stats">
            <div>
              <span>Average first response among responders</span>
              <strong>
                {enough && insight?.average_response_days !== null
                  ? `${insight?.average_response_days} days`
                  : "Not enough data"}
              </strong>
              <span>
                {enough ? insight?.response_reports : "Insufficient recent"}{" "}
                responses recorded or reported
              </span>
            </div>
            <div>
              <span>No meaningful response after 2 months</span>
              <strong>
                {enough
                  ? `${insight?.no_response_reports} / ${insight?.eligible_reports}`
                  : "Not enough data"}
              </strong>
              <span>Eligible candidates</span>
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
            responders for an average. Off-site silence reports must be
            reconfirmed within 30 days. Snapshots older than 24 hours are hidden
            until refreshed.
          </p>
          {source === "live" && (
            <>
              <ResponseReportForm organisationId={company.id} />
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
            Current opportunities with this employer
          </p>
          {!jobs.length && (
            <p className="panel">No current roles with this employer.</p>
          )}
          <div className="company-role-list">
            {jobs.map((job) => (
              <JobCard job={job} key={job.id} />
            ))}
          </div>
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
