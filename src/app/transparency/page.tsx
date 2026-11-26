import { publicPageMetadata } from "@/lib/search-metadata";
import Link from "next/link";
import { ArrowRight, Eye, MessageCircle, ShieldCheck } from "lucide-react";
export const metadata = publicPageMetadata(
  "/transparency",
  "Our transparency promise",
  "How Westmere Careers records application activity and response insights, and the limits of what those signals can tell job seekers and hiring teams.",
);
export default function Transparency() {
  return (
    <main id="main" className="container legal">
      <div className="page-intro">
        <p className="eyebrow">Clarity is a kind of kindness</p>
        <h1>You deserve a clearer picture.</h1>
        <p className="muted">
          Here’s what application activity and response insights mean—and how we
          keep their limits visible.
        </p>
      </div>
      <h2>Application activity we can record</h2>
      <p>
        For an application submitted through Westmere, we record when it is
        received and when an authorised hiring team member intentionally opens
        its detail view. Loading an applicant list does not count. An opening
        does not prove a full read, shortlisting or an interview offer.
      </p>
      <p>
        Employer decisions and individual messages can appear as separate
        timeline events. A recorded message is different from an email being
        delivered or read.
      </p>
      <h2>External applications</h2>
      <p>
        If you apply on another website, Westmere cannot see the application
        being submitted or opened. An outbound click is not evidence of a
        submission. External listings are labelled before you leave.
      </p>
      <h2>Recorded and reported employer responses</h2>
      <p>
        For applications submitted on Westmere, response times use the first
        recorded employer message or application decision. Receipts, list views,
        document openings and generic closure notices do not count. Candidate
        reports cannot replace these recorded dates. For off-site applications,
        we rely on the candidate’s reported experience. A meaningful response is
        a direct contact or a specific application decision; an automated
        decision is labelled as such. Receipts, marketing and generic processing
        notices do not count.
      </p>
      <p>
        “More than two months” means strictly beyond two calendar months from
        the application, with dates at month-end clamped to the destination
        month’s last valid date.
      </p>
      <h2>When an employer may be labelled unresponsive</h2>
      <p>
        The proposed public label requires at least 10 unique eligible
        candidates, with more than half having no meaningful reply beyond two
        months. The numerator, denominator and reporting period must be visible.
        Smaller samples show “Not enough response data”. A new employer is not
        presumed unresponsive.
      </p>
      <p>
        The initial reporting cohort covers applications submitted three to six
        months before a snapshot. Off-site no-response reports need
        reconfirmation within 30 days. On-site silence is determined from the
        absence of a recorded meaningful response. Late recorded replies update
        the figures. The average response time is calculated only among
        responders, requires at least five responses, and is shown alongside
        no-response counts. On-site listing figures use only on-site application
        activity; off-site listing figures use accepted off-site reports.
        Employer profile figures combine these sources, counting each candidate
        once.
      </p>
      <h2>Reports describe experiences, not everyone</h2>
      <p>
        People who report may differ from those who don’t. External application
        evidence is self-reported. We do not infer employer silence because a
        candidate ignores our feedback request. An agency’s handling is
        attributed to the agency, rather than an unverified end client.
      </p>
      <h2>Fairness for candidates and employers</h2>
      <p>
        Off-site reports are reviewed, duplicates excluded, and small samples
        suppressed. Each candidate can review a job title at a business once,
        choosing from positions published in the last six months. On-site
        feedback is affirmed when its dates agree with recorded activity;
        discrepancies do not change the recorded statistics. Payment cannot
        remove valid negative reports or improve a responsiveness label.
      </p>
      <div className="notice" style={{ marginTop: 25 }}>
        Employer response information is published only when there is enough
        recent, eligible evidence. When there is not enough evidence, we say so.
        Test companies, vacancies and synthetic reports are excluded from the
        public marketplace.
      </div>
      <h2>Trust stays part of the free service</h2>
      <p>
        Careers+ pays for preparation tools. Searching, applying, application
        status and published employer-response information are part of the free
        marketplace.
      </p>
      <Link className="text-link" style={{ marginTop: 24 }} href="/jobs">
        Explore the experience
        <ArrowRight size={17} />
      </Link>
    </main>
  );
}
