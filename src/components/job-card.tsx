import Link from "next/link";
import {
  MapPin,
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
          ? "Unresponsive · candidate reported"
          : job.responseDays !== null
            ? `${job.responseDays}-day first response`
            : "Not enough response data"}
      </span>
      <small>
        {unresponsive
          ? `${job.noResponseReports}/${job.eligibleReports} reports: no reply >2 months`
          : job.responseDays !== null
            ? `${job.responseReports} reports with a response`
            : "New employer profile"}
      </small>
    </div>
  );
}
export function JobCard({
  job,
  featured = false,
  match,
}: {
  job: Job;
  featured?: boolean;
  match?: number;
}) {
  return (
    <article className={`job-card ${featured ? "featured" : ""}`}>
      <div className="job-card-top">
        <Link
          className={`company-monogram tone-${job.companyInitial.charCodeAt(0) % 4}`}
          href={`/companies/${job.id}`}
          aria-label={`${job.company} profile`}
        >
          {job.companyInitial}
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
        <Link href={`/jobs/${job.id}`}>
          <h3>{job.title}</h3>
        </Link>
        <Link className="company-name" href={`/companies/${job.id}`}>
          {job.company}
        </Link>
      </div>
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
    </article>
  );
}
