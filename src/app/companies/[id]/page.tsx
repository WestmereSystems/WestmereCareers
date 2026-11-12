import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, MessageCircle } from "lucide-react";
import { getPublicJob } from "@/lib/jobs-server";
import { JobCard } from "@/components/job-card";
export default async function Company({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { job, source, error } = await getPublicJob(id);
  if (error)
    return (
      <main id="main" className="container section">
        <p className="notice" role="alert">
          {error}
        </p>
      </main>
    );
  if (!job) notFound();
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
            {job.companyInitial}
          </span>
          <p className="eyebrow">Meet the employer</p>
          <h1 style={{ fontSize: 38 }}>{job.company}</h1>
          <p style={{ marginTop: 14 }}>
            {job.category} · {job.city} · {job.companySize}
          </p>
          <h2>A little about us</h2>
          <p>{job.companyDescription}</p>
          <h2>What candidates have reported</h2>
          <p>
            These reports describe individual experiences. They may not
            represent every applicant or predict the outcome of your
            application.
          </p>
          <div className="company-stats">
            <div>
              <span>Median first response among responders</span>
              <strong>
                {job.responseDays !== null
                  ? `${job.responseDays} days`
                  : "Not enough data"}
              </strong>
              <span>{job.responseReports} reports with a response</span>
            </div>
            <div>
              <span>No response reported after 2 months</span>
              <strong>
                {job.eligibleReports
                  ? `${job.noResponseReports} / ${job.eligibleReports}`
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
          <JobCard job={job} />
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
