import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  Clock3,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { getPublicJob } from "@/lib/jobs-server";
import { formatSalary } from "@/lib/search";
import { SaveButton } from "@/components/providers";
import { ResponseInsight } from "@/components/job-card";
import { ApplyPanel } from "@/components/candidate-pages";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { job } = await getPublicJob(id);
  return { title: job ? `${job.title} at ${job.company}` : "Role unavailable" };
}
export default async function JobDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { job, source, error } = await getPublicJob(id);
  if (error)
    return (
      <main id="main" className="container section">
        <p role="alert" className="notice">
          {error}
        </p>
        <Link href="/jobs" className="text-link">
          Back to search
          <ArrowRight size={16} />
        </Link>
      </main>
    );
  if (!job) notFound();
  return (
    <main id="main" className="container page-intro page-content">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/jobs">
          <ArrowLeft size={12} />
          Find a job
        </Link>
        <span>/</span>
        <span>{job.title}</span>
      </nav>
      {source === "demo" && (
        <p className="demo-note">
          <span />
          Development preview · Fictional employer and sample role. Applications
          are not sent.
        </p>
      )}
      <div className="detail-grid">
        <article className="detail-card">
          <div className="detail-header">
            <Link
              className="company-monogram tone-0"
              href={`/companies/${job.id}`}
            >
              {job.companyInitial}
            </Link>
            <div>
              <h1>{job.title}</h1>
              <Link className="company-name" href={`/companies/${job.id}`}>
                {job.company} ↗
              </Link>
            </div>
          </div>
          <div className="job-facts">
            <span>
              <MapPin size={15} />
              {job.location} · {job.workMode}
            </span>
            <span>
              <Clock3 size={15} />
              {job.employmentType}
            </span>
          </div>
          <div className="detail-salary">{formatSalary(job)}</div>
          <div className="job-tags">
            {job.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          <ResponseInsight job={job} />
          <h2>A little about the opportunity</h2>
          <p>{job.description}</p>
          <h2>What you’ll be doing</h2>
          <ul>
            {job.responsibilities.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h2>What you’ll bring</h2>
          <ul>
            {job.requirements.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <h2>Skills for this role</h2>
          <div className="job-tags">
            {job.skills.map((skill) => (
              <span key={skill}>{skill}</span>
            ))}
          </div>
          <div className="detail-actions">
            <SaveButton id={job.id} />
            <Link className="button secondary" href={`/studio?job=${job.id}`}>
              <Sparkles size={16} />
              Prepare with Careers+
            </Link>
          </div>
          <div style={{ marginTop: 25 }}>
            <ApplyPanel job={job} isDemo={source === "demo"} />
          </div>
        </article>
        <aside className="detail-aside">
          <section className="panel">
            <h3>A clearer picture of the employer.</h3>
            <p className="muted" style={{ fontSize: 12 }}>
              {job.companyDescription}
            </p>
            <p className="fineprint">
              {job.companySize} · {job.city}
            </p>
            <Link className="text-link" href={`/companies/${job.id}`}>
              Explore employer profile
              <ArrowRight size={16} />
            </Link>
          </section>
          <section className="panel premium-panel">
            <span className="plus-wordmark">
              <Sparkles size={17} />
              Careers+
            </span>
            <h3 style={{ marginTop: 17 }}>Show what makes you, you.</h3>
            <p>
              Get thoughtful CV improvements and a tailored application grounded
              in your experience.
            </p>
            <Link
              className="text-link"
              style={{ color: "var(--purple)" }}
              href={`/studio?job=${job.id}`}
            >
              Explore Application Studio
              <ArrowRight size={16} />
            </Link>
          </section>
          <section className="panel">
            <ShieldCheck size={22} style={{ color: "var(--primary)" }} />
            <h3 style={{ marginTop: 15 }}>Your information, your choice.</h3>
            <p className="fineprint">
              Only share details relevant to the role. Employers should never
              ask you to pay to apply or provide bank details during an ordinary
              application.
            </p>
            <Link href="/transparency" className="text-link">
              How Westmere works
              <ArrowRight size={16} />
            </Link>
          </section>
        </aside>
      </div>
    </main>
  );
}
