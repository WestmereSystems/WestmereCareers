import { companyPath } from "@/lib/company-urls";
import Link from "next/link";
import {
  MapPin,
  CircleCheck,
  Clock3,
  ArrowUpRight,
  Check,
  MessageCircle,
} from "lucide-react";
import type { Job } from "@/lib/jobs";
import { formatSalary } from "@/lib/search";
import { SaveButton } from "./providers";

export function ResponseInsight({ job }: { job: Job }) {
  const unresponsive =
    job.eligibleReports >= 10 &&
    job.noResponseReports / job.eligibleReports > 0.5;
  return (
    <div className={`response-insight ${unresponsive ? "warning" : ""}`}>
      <MessageCircle size={14} />
      <span>
        {unresponsive
          ? job.source === "direct"
            ? "No recorded response after two months"
            : "Unresponsive · candidate reported"
          : job.responseDays !== null
            ? `${job.responseDays}-day average first response`
            : "Not enough response data"}
      </span>
      <small>
        {unresponsive
          ? `${job.noResponseReports}/${job.eligibleReports} ${job.source === "direct" ? "applications" : "reports"}: no reply >2 months`
          : job.responseDays !== null
            ? `${job.responseReports} ${job.source === "direct" ? "recorded responses" : "reports with a response"}`
            : "Small or insufficient recent sample"}
      </small>
    </div>
  );
}
export function JobCard({
  job,
  featured = false,
  match,
  children,
}: {
  job: Job;
  featured?: boolean;
  match?: number;
  children?: React.ReactNode;
}) {
  return (
    <article className={`job-card ${featured ? "featured" : ""}`}>
      <div className="job-card-top">
        <Link
          className={`company-monogram tone-${job.companyInitial.charCodeAt(0) % 4}`}
          href={companyPath(job.company, job.organisationId ?? job.id)}
          aria-label={`${job.company} profile`}
        >
          {job.avatarPath && job.organisationId ? (
            <img
              src={`/api/employer-image?id=${job.organisationId}&kind=avatar`}
              alt=""
              width="48"
              height="48"
              loading="lazy"
            />
          ) : (
            job.companyInitial
          )}
        </Link>
        <span className="job-type-label">
          {job.source === "direct" ? (
            <>
              <Check size={12} />
              Apply on Westmere
            </>
          ) : (
            <>
              External listing
              <ArrowUpRight size={12} />
            </>
          )}
        </span>
        <SaveButton id={job.id} compact />
      </div>
      <div className="job-card-title">
        {job.isClosed ? (
          <h3>
            <span className="badge">Role closed</span> {job.title}
          </h3>
        ) : (
          <Link className="job-primary-link" href={`/jobs/${job.id}`}>
            <h3>
              {job.isTest && (
                <span className="badge">Test role · fictional</span>
              )}
              {job.title}
            </h3>
          </Link>
        )}
        <Link
          className="company-name"
          href={companyPath(job.company, job.organisationId ?? job.id)}
        >
          {job.isVerified && !job.isTest && (
            <CircleCheck
              size={16}
              className="business-verified-icon"
              aria-label="Business identity and hiring authority checked"
            />
          )}
          {job.company}
          {job.advertiserKind === "agency" && " · Recruitment agency"}
        </Link>
      </div>
      {job.advertiserKind === "agency" && (
        <p className="fineprint">
          Client: {job.clientLabel || "Confidential client"}. Applications go to
          the recruiting agency.
        </p>
      )}
      <div className="job-facts">
        <span>
          <MapPin size={14} />
          {job.location}
        </span>
        <span>
          <Clock3 size={14} />
          {job.employmentType} · {job.workMode}
        </span>
      </div>
      <p className="job-salary">{formatSalary(job)}</p>
      <div className="job-tags">
        {job.tags.slice(0, 2).map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
        {match !== undefined && (
          <span className="match-label">
            {Math.round(match * 100)}% skill overlap
          </span>
        )}
      </div>
      <ResponseInsight job={job} />
      {children}
    </article>
  );
}
