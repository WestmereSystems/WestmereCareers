import Link from "next/link";
import { ArrowRight, Eye, MessageCircle, ShieldCheck } from "lucide-react";
export const metadata = { title: "Our transparency promise" };
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
      <h2>Candidate-reported employer responses</h2>
      <p>
        Response times describe reports from candidates. They are separate from
        Westmere-recorded application activity. A meaningful response is a
        direct contact or a specific application decision; an automated decision
        is labelled as such. Receipts, marketing and generic processing notices
        do not count.
      </p>
      <p>
        “More than two months” means strictly beyond two calendar months from
        the application, with dates at month-end clamped to the destination
        month’s last valid date.
      </p>
      <h2>When an employer may be labelled unresponsive</h2>
      <p>
        The proposed public label requires at least 10 unique eligible candidate
        reports, with more than half reporting no meaningful reply beyond two
        months. The numerator, denominator and reporting period must be visible.
        Smaller samples show “Not enough response data”. A new employer is not
        presumed unresponsive.
      </p>
      <p>
        The initial reporting cohort covers applications submitted three to six
        months before a snapshot. No-response reports need reconfirmation within
        30 days. Late replies and corrections update the figures. A median
        response time is calculated only among respondents who reported
        receiving a response, and is shown alongside no-response counts.
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
        Reports must be moderated, duplicates excluded, and small samples
        suppressed. Employers need a correction and appeal process. Payment
        cannot remove valid negative reports or improve a responsiveness label.
      </p>
      <div className="notice" style={{ marginTop: 25 }}>
        Development status: the response-reporting schema is included, but
        public aggregation, moderation and appeals are not yet operational. All
        response figures in the sample inventory are fictional and clearly
        labelled. No public employer-rating service is active.
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
