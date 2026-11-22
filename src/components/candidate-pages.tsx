"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  LoaderCircle,
  FileText,
  Mail,
  ShieldCheck,
  ExternalLink,
  LogOut,
  Download,
} from "lucide-react";
import { useSession } from "./providers";
import { useNotice, individualNotice } from "./notices";
import { ApplicationWizard } from "./application-wizard";
import { CandidateProfileCard } from "./candidate-profile";
import { ApplicationCV } from "./application-cv";
import { CVHistory, ChangeEmail, SavedCVButton } from "./profile-tools";
import { JobCard } from "./job-card";
import { ResponseChoices } from "./trust-workflows";
import { ListingCopy } from "./listing-copy";
import { EmptyState } from "./shell";
import type { Job } from "@/lib/jobs";

export function ApplyPanel(props: { job: Job; isDemo: boolean }) {
  const session = useSession();
  return (
    <ApplyPanelForUser
      key={`${session.user?.id ?? "signed-out"}:${props.job.id}`}
      {...props}
    />
  );
}
function ApplyPanelForUser({ job, isDemo }: { job: Job; isDemo: boolean }) {
  const session = useSession();
  const notice = useNotice();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  if (session.business)
    return (
      <div className="application-personal-required">
        <button
          className="button primary"
          onClick={() =>
            notice({
              ...individualNotice,
              title: "Use a personal account to apply",
              message:
                "Applying for roles is for personal accounts. Sign in with a separate personal account to share your CV and application with an employer.",
            })
          }
        >
          Use a personal account to apply
        </button>
        <p className="fineprint">
          Business accounts manage hiring. Apply using your own personal
          account.
        </p>
      </div>
    );
  if (session.loading)
    return (
      <button className="button primary" disabled>
        Checking application access…
      </button>
    );
  if (job.source === "external")
    return (
      <div>
        {job.externalUrl && !isDemo ? (
          <a
            className="button primary"
            href={job.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Apply on employer website
            <ExternalLink size={16} />
          </a>
        ) : (
          <button
            className="button secondary"
            onClick={() =>
              setMessage(
                "This fictional external role illustrates an off-site application. No employer website is linked.",
              )
            }
          >
            External listing preview
            <ExternalLink size={16} />
          </button>
        )}
        <p className="fineprint" style={{ marginTop: 12 }}>
          You’ll apply outside Westmere. Application activity and submission
          cannot be recorded here.
        </p>
        {message && (
          <p className="message" role="status">
            {message}
          </p>
        )}
      </div>
    );
  return (
    <div>
      <button
        className="button primary"
        disabled={!isDemo && session.loading}
        onClick={() => {
          if (!isDemo && !session.user) session.openAuth();
          else setOpen(!open);
        }}
      >
        {isDemo ? "Explore the application flow" : "Apply for this role"}
        <ArrowRight size={16} />
      </button>
      {open && (
        <ApplicationWizard
          job={job}
          isDemo={isDemo}
          onClose={() => setOpen(false)}
        />
      )}
      {message && (
        <p role="status" className="message">
          {message}
        </p>
      )}
    </div>
  );
}

export function SavedRoles({ source }: { source: string }) {
  const session = useSession();
  const [jobs, setJobs] = useState<Job[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(true);
  useEffect(() => {
    if (!session.user) {
      setJobs([]);
      setBusy(false);
      return;
    }
    const c = new AbortController();
    setBusy(true);
    fetch("/api/jobs/saved", { cache: "no-store", signal: c.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (!c.signal.aborted) {
          setJobs(d.jobs || []);
          setMessage("");
        }
      })
      .catch((e) => {
        if (!c.signal.aborted)
          setMessage(e.message || "Saved roles are unavailable.");
      })
      .finally(() => {
        if (!c.signal.aborted) setBusy(false);
      });
    return () => c.abort();
  }, [session.user?.id, session.savedIds.join(",")]);
  if (session.loading || busy)
    return <p role="status">Loading your saved roles…</p>;
  if (!session.user)
    return (
      <div className="panel">
        <h2>Your shortlist, all in one place.</h2>
        <p>Sign in to save roles privately across your devices.</p>
        <button className="button primary" onClick={session.openAuth}>
          Sign in to save roles
        </button>
      </div>
    );
  return (
    <>
      {message && (
        <p role="alert" className="message">
          {message}
        </p>
      )}
      {jobs.length ? (
        <div className="job-list">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job}>
              {job.isClosed && (
                <details className="saved-listing-details">
                  <summary>View saved listing details</summary>
                  <p className="notice">
                    This role has closed and is no longer accepting
                    applications. This private copy was retained when you saved
                    it.
                  </p>
                  <ListingCopy job={job} />
                </details>
              )}
            </JobCard>
          ))}
        </div>
      ) : (
        <EmptyState
          title="A little room for possibility."
          description="Save a role when it catches your eye. Closed roles you saved retain a private copy of their listing."
          action="Find a role"
          href="/jobs"
        />
      )}
    </>
  );
}

type Application = {
  id: string;
  status: string;
  created_at: string;
  withdrawn_at: string | null;
  job_title_snapshot: string;
  roleClosed?: boolean;
  retainedListing?: Job;
  company_snapshot: string;
  advertiser_kind_snapshot?: string;
  client_label_snapshot?: string | null;
  recipient_snapshot?: string | null;
  location_snapshot: string;
  application_events: {
    id: string;
    event_type: string;
    message?: string;
    source: string;
    occurred_at: string;
  }[];
};
export function Applications({ compact = false }: { compact?: boolean }) {
  const session = useSession();
  return (
    <ApplicationsForUser
      key={session.user?.id ?? "signed-out"}
      compact={compact}
    />
  );
}
function ApplicationsForUser({ compact }: { compact: boolean }) {
  const session = useSession();
  const [apps, setApps] = useState<Application[]>([]);
  const [reportId, setReportId] = useState<string | null>(null);
  const [responded, setResponded] = useState(false);
  const [responseDate, setResponseDate] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(Boolean(session.user));
  const [loadError, setLoadError] = useState(false);
  async function load(signal?: AbortSignal) {
    setBusy(true);
    setLoadError(false);
    try {
      const r = await fetch("/api/applications", { cache: "no-store", signal });
      const data = await r.json();
      if (r.ok) setApps(data.applications);
      else {
        setMessage(data.error);
        setLoadError(true);
      }
    } catch {
      if (!signal?.aborted) {
        setLoadError(true);
        setMessage("Your applications couldn’t be loaded. Please try again.");
      }
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    if (session.user) void load(controller.signal);
    return () => controller.abort();
  }, [session.user?.id]);
  async function withdraw(id: string) {
    if (
      !confirm(
        "Withdraw this application? The employer will no longer be able to progress it through Westmere.",
      )
    )
      return;
    try {
      const r = await fetch("/api/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: id }),
      });
      const data = await r.json();
      setMessage(data.message || data.error);
      if (r.ok) await session.refresh();
      if (r.ok) await load();
    } catch {
      setMessage("We couldn’t withdraw your application. Please try again.");
    }
  }
  async function report(event: React.FormEvent) {
    event.preventDefault();
    if (!reportId) return;
    setBusy(true);
    try {
      const response = await fetch("/api/applications/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: reportId,
          responseReceived: responded,
          responseDate: responded ? new Date(responseDate).toISOString() : null,
        }),
      });
      const data = await response.json();
      setMessage(data.message || data.error);
      if (response.ok) {
        setReportId(null);
        setResponseDate("");
      }
    } catch {
      setMessage(
        "Your report was not recorded. Please check the response date and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (session.loading) return <p role="status">Loading your applications…</p>;
  if (!session.user)
    return (
      <div className="panel">
        <span className="round-icon">
          <FileText />
        </span>
        <h2>Your next chapter, in progress.</h2>
        <p className="muted" style={{ margin: "16px 0 24px" }}>
          Sign in to see your applications and the activity recorded for each
          one.
        </p>
        <button className="button primary" onClick={session.openAuth}>
          Sign in to view applications
          <ArrowRight size={16} />
        </button>
      </div>
    );
  if (compact)
    return (
      <section
        className="panel profile-applications"
        aria-labelledby="profile-applications-heading"
      >
        <div className="section-heading">
          <h2 id="profile-applications-heading">Your applications</h2>
          <Link className="text-link" href="/applications">
            View application history <ArrowRight size={17} />
          </Link>
        </div>
        {busy ? (
          <p role="status">Loading your applications…</p>
        ) : loadError ? (
          <div>
            <p role="alert">Your applications couldn’t be loaded.</p>
            <button className="button secondary" onClick={() => void load()}>
              Try again
            </button>
          </div>
        ) : apps.length ? (
          <>
            <p className="fineprint">
              Your five most recent Westmere applications. Open your history for
              timelines, response reports and application controls.
            </p>
            {apps.slice(0, 5).map((app) => (
              <article className="application-row" key={app.id}>
                <div>
                  <h3>{app.job_title_snapshot}</h3>
                  {app.roleClosed && <span className="badge">Role closed</span>}
                  <p>
                    {app.company_snapshot} · {app.location_snapshot}
                  </p>
                  <p>
                    Applied{" "}
                    {new Date(app.created_at).toLocaleDateString("en-AU")}
                  </p>
                </div>
                <span className="badge">
                  {app.withdrawn_at
                    ? "Withdrawn"
                    : app.status.replaceAll("_", " ")}
                </span>
              </article>
            ))}
          </>
        ) : (
          <div>
            <p>
              Your submitted Westmere applications will appear here, with the
              role, employer and current status.
            </p>
            <Link className="button secondary" href="/jobs">
              Find your next role <ArrowRight size={17} />
            </Link>
          </div>
        )}
      </section>
    );
  return (
    <>
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
      {busy ? (
        <p role="status">Loading your applications…</p>
      ) : loadError ? (
        <button className="button secondary" onClick={() => void load()}>
          Try loading applications again
        </button>
      ) : apps.length ? (
        <div className="panel">
          {apps.map((app) => (
            <article className="application-row" key={app.id}>
              <div>
                <h3>{app.job_title_snapshot}</h3>
                {app.roleClosed && <span className="badge">Role closed</span>}
                <p>
                  {app.company_snapshot} · {app.location_snapshot}
                </p>
                {app.advertiser_kind_snapshot === "agency" && (
                  <p className="fineprint">
                    Recruitment agency ·{" "}
                    {app.client_label_snapshot || "Confidential client"}
                    <br />
                    Initial recipient:{" "}
                    {app.recipient_snapshot || app.company_snapshot}
                  </p>
                )}
                <p>
                  Applied {new Date(app.created_at).toLocaleDateString("en-AU")}{" "}
                  · {app.withdrawn_at ? "Withdrawn" : app.status}
                </p>
                <button
                  className="text-button"
                  type="button"
                  style={{ marginTop: 12 }}
                  onClick={() => {
                    setReportId(app.id);
                    setResponded(false);
                    setResponseDate("");
                  }}
                >
                  Report your response experience
                </button>
                {reportId === app.id && (
                  <form className="application-form" onSubmit={report}>
                    <h3>Help make hiring clearer.</h3>
                    <p className="fineprint">
                      Describe your experience for this application. A receipt
                      or generic processing message doesn’t count as a
                      meaningful response. On-site statistics use recorded
                      employer updates. If your response date agrees with the
                      recorded date, your feedback can be affirmed.
                    </p>
                    <ResponseChoices
                      value={responded}
                      onChange={setResponded}
                      name={`response-${app.id}`}
                    />
                    {responded && (
                      <label className="field-label" style={{ marginTop: 12 }}>
                        When did you first hear back?
                        <input
                          type="datetime-local"
                          value={responseDate}
                          onChange={(e) => setResponseDate(e.target.value)}
                          required
                        />
                      </label>
                    )}
                    <div className="inline-actions">
                      <button
                        type="submit"
                        className="button primary small"
                        disabled={busy}
                      >
                        Submit experience report
                      </button>
                      <button
                        type="button"
                        className="button secondary small"
                        onClick={() => setReportId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
                {app.retainedListing && (
                  <details className="trust-disclosure">
                    <summary>View the listing submitted against</summary>
                    {app.roleClosed && (
                      <p className="notice">
                        This role has closed. Your application and submitted
                        listing copy remain private here.
                      </p>
                    )}
                    <ListingCopy job={app.retainedListing} />
                  </details>
                )}
                <div
                  className="timeline-preview"
                  style={{
                    transform: "none",
                    boxShadow: "none",
                    border: 0,
                    padding: "15px 0 0",
                  }}
                >
                  {app.application_events.map((event) => (
                    <div className="timeline-item complete" key={event.id}>
                      <span />
                      <div>
                        <strong>
                          {event.event_type === "opened" &&
                          app.advertiser_kind_snapshot === "agency"
                            ? "Opened by recruiting agency"
                            : event.event_type.replaceAll("_", " ")}
                        </strong>
                        <p>
                          {new Date(event.occurred_at).toLocaleString("en-AU")}{" "}
                          · {event.source}
                        </p>
                        {event.message && <p>{event.message}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {!app.withdrawn_at && (
                <button
                  className="text-button"
                  onClick={() => withdraw(app.id)}
                >
                  Withdraw application
                </button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Your next move is ahead of you."
          description="Your submitted Westmere applications will appear here, with a clear activity timeline."
          action="Find a role"
          href="/jobs"
        />
      )}
      <p className="fineprint" style={{ marginTop: 20 }}>
        An opened application means a hiring team member opened its detail view.
        It does not confirm a full review, a shortlist or an interview. External
        application activity is unavailable.
      </p>
    </>
  );
}

export function Account({
  section = "profile",
}: {
  section?: "profile" | "settings";
}) {
  const session = useSession();
  return (
    <AccountForUser key={session.user?.id ?? "signed-out"} section={section} />
  );
}
function AccountForUser({ section }: { section: "profile" | "settings" }) {
  const session = useSession();
  const [applicationEmails, setApplicationEmails] = useState(true);
  const [name, setName] = useState("");
  const [cv, setCv] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!session.user) return;
    const controller = new AbortController();
    fetch("/api/profile", { cache: "no-store", signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error("Profile unavailable");
        return r.json();
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setName(data.profile?.full_name || "");
        setCv(data.profile?.cv_text || "");
        setApplicationEmails(data.profile?.application_email_enabled !== false);
        setLoaded(true);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setMessage("Your profile couldn’t be loaded.");
      });
    return () => controller.abort();
  }, [session.user?.id, session.user?.fullName]);
  async function save(event?: React.FormEvent) {
    event?.preventDefault();
    if (!loaded) return;
    setBusy(true);
    try {
      const r = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: name,
          cvText: cv,
          applicationEmailEnabled: applicationEmails,
        }),
      });
      const data = await r.json();
      setMessage(data.message || data.error);
      if (r.ok) await session.refresh();
    } catch {
      setMessage("Your profile wasn’t saved. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    try {
      const response = await fetch("/api/auth/sign-out", { method: "POST" });
      if (!response.ok) {
        setMessage("We couldn’t sign you out. Please try again.");
        return;
      }
      setCv("");
      setName("");
      await session.refresh();
    } catch {
      setMessage("We couldn’t connect to sign out. Please try again.");
    }
  }
  async function portal() {
    try {
      const r = await fetch("/api/billing/portal", { method: "POST" });
      const data = await r.json();
      if (r.ok && data.url) window.location.assign(data.url);
      else setMessage(data.error);
    } catch {
      setMessage("Billing is temporarily unavailable.");
    }
  }
  if (session.loading) return <p role="status">Loading your profile…</p>;
  if (!session.user)
    return (
      <EmptyState
        title="Make yourself at home."
        description="Sign in to manage your profile, CV and application preferences."
      />
    );
  return (
    <>
      {session.sampleWorkspace && (
        <p className="notice">
          <Link className="text-link" href="/employers/sample">
            Open your sample hiring workspace →
          </Link>
        </p>
      )}
      {!session.user.fullName && !session.business && (
        <p className="notice">
          Welcome. Add your name below to finish setting up your profile.
        </p>
      )}

      <div
        className={
          section === "profile" ? "candidate-profile-stack" : "profile-settings"
        }
      >
        {section === "profile" && <CandidateProfileCard />}
        {section === "settings" && (
          <div>
            <section className="panel">
              <span className="badge">
                <ShieldCheck size={13} />
                Private by default
              </span>
              <h2 style={{ marginTop: 20 }}>Your account</h2>
              <p>{session.user.email}</p>
              <ChangeEmail />
              {!session.business && (
                <>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={applicationEmails}
                      onChange={(e) => setApplicationEmails(e.target.checked)}
                    />
                    Email me application activity and employer updates
                  </label>
                  <p className="fineprint">
                    Save your profile to apply this preference. Site
                    notifications remain available. Job-alert preferences are
                    separate.
                  </p>
                  <button
                    className="button primary"
                    disabled={busy || !loaded}
                    onClick={() => void save()}
                  >
                    Save preferences <Check size={16} />
                  </button>
                </>
              )}
              {!session.business && (
                <>
                  <p>
                    {session.isPremium
                      ? "Careers+ · Active membership"
                      : "Free Westmere account"}
                  </p>
                  {session.isPremium ? (
                    <button className="button secondary" onClick={portal}>
                      Manage billing and cancellation
                      <ArrowRight size={15} />
                    </button>
                  ) : (
                    <Link href="/careers-plus" className="button secondary">
                      Explore Careers+
                      <ArrowRight size={15} />
                    </Link>
                  )}
                </>
              )}
              <button
                className="text-button"
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  marginTop: 25,
                }}
                onClick={signOut}
              >
                <LogOut size={15} />
                Sign out
              </button>
            </section>
            <p className="fineprint" style={{ marginTop: 20 }}>
              Request an account copy, correction or deletion through our
              Privacy Officer at support@westmere.com.au. See our privacy policy
              for details.
            </p>
          </div>
        )}
      </div>
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
    </>
  );
}
