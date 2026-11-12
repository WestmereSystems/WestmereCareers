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
import { JobCard } from "./job-card";
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
  const [open, setOpen] = useState(false);
  const [cv, setCv] = useState("");
  const [letter, setLetter] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function apply(event: React.FormEvent) {
    event.preventDefault();
    if (isDemo) {
      setMessage(
        "This is a sample role. Your application has not been sent or saved. Explore real roles when Westmere opens.",
      );
      return;
    }
    if (!session.user) {
      session.openAuth();
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job.id,
          cvText: cv,
          coverLetter: letter,
          consent,
        }),
      });
      const data = await r.json();
      setMessage(
        r.ok
          ? "Your application has been received. You can follow it in My applications."
          : data.error || "We couldn’t submit your application.",
      );
      if (r.ok) {
        setCv("");
        setLetter("");
        setOpen(false);
      }
    } catch {
      setMessage(
        "We couldn’t connect. Your application has not been submitted.",
      );
    } finally {
      setBusy(false);
    }
  }
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
        onClick={() => {
          if (!isDemo && !session.user) session.openAuth();
          else setOpen(!open);
        }}
      >
        {isDemo ? "Explore the application flow" : "Apply for this role"}
        <ArrowRight size={16} />
      </button>
      {open && (
        <form className="application-form" onSubmit={apply}>
          <h3>{isDemo ? "Application preview" : "Make your next move"}</h3>
          <p className="fineprint">
            {isDemo
              ? "Sample role: nothing entered here is submitted or persisted."
              : "Share your CV and optional cover letter with this employer. You’ll be able to track application activity."}
          </p>
          <label className="field-label" htmlFor="application-cv">
            Your CV text
          </label>
          <textarea
            id="application-cv"
            required
            minLength={50}
            maxLength={40000}
            value={cv}
            onChange={(e) => setCv(e.target.value)}
            placeholder="Paste the CV you’d like to share…"
          />
          <label className="field-label" htmlFor="application-letter">
            Cover letter <span className="muted">(optional)</span>
          </label>
          <textarea
            id="application-letter"
            maxLength={15000}
            value={letter}
            onChange={(e) => setLetter(e.target.value)}
            style={{ minHeight: 120 }}
          />
          <label className="checkbox-label">
            <input
              type="checkbox"
              required
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              {isDemo
                ? "I understand this is a preview and no application will be sent."
                : "I want to share these documents with the hiring employer for this application."}
            </span>
          </label>
          <div className="inline-actions">
            <button type="submit" className="button primary" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Check size={16} />
              )}{" "}
              {isDemo ? "Preview submission" : "Submit application"}
            </button>
            <Link href={`/studio?job=${job.id}`} className="button secondary">
              Prepare with Careers+
            </Link>
          </div>
        </form>
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
  const [saved, setSaved] = useState<string[] | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [resolvedSource, setResolvedSource] = useState(source);
  const [unavailable, setUnavailable] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    function refresh() {
      try {
        const stored: unknown = JSON.parse(
          localStorage.getItem("westmere-saved") || "[]",
        );
        setSaved(
          Array.isArray(stored)
            ? [
                ...new Set(
                  stored.filter(
                    (id): id is string =>
                      typeof id === "string" && id.length <= 100,
                  ),
                ),
              ]
            : [],
        );
      } catch {
        setSaved([]);
      }
    }
    refresh();
    window.addEventListener("westmere-saved", refresh);
    return () => window.removeEventListener("westmere-saved", refresh);
  }, []);
  useEffect(() => {
    if (saved === null) return;
    const controller = new AbortController();
    if (!saved.length) {
      setJobs([]);
      setUnavailable(0);
      setBusy(false);
      setMessage("");
      return;
    }
    setBusy(true);
    setMessage("");
    const params = new URLSearchParams({ ids: saved.slice(0, 100).join(",") });
    fetch(`/api/jobs/saved?${params}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Your saved roles couldn’t be loaded.");
        if (!controller.signal.aborted) {
          setJobs(data.jobs);
          setUnavailable(data.unavailableIds?.length ?? 0);
          setResolvedSource(data.source);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setJobs([]);
          setUnavailable(0);
          setMessage(
            error instanceof Error
              ? error.message
              : "Your saved roles couldn’t be loaded.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [saved, retry]);
  return (
    <>
      <p className="notice">
        Saved roles are kept on this device. Your CV is never stored in browser
        storage.{" "}
        {resolvedSource === "demo" ? "These are fictional sample roles." : ""}
      </p>
      {saved && saved.length > 100 && (
        <p className="notice">
          Showing the first 100 saved roles. You have {saved.length} saved on
          this device.
        </p>
      )}
      {busy ? (
        <p role="status">Finding your saved possibilities…</p>
      ) : message ? (
        <div className="panel">
          <p role="alert">{message}</p>
          <button
            type="button"
            className="button secondary small"
            onClick={() => setRetry((value) => value + 1)}
            style={{ marginTop: 15 }}
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          {unavailable > 0 && (
            <p className="notice" role="status">
              {unavailable} saved {unavailable === 1 ? "role is" : "roles are"}{" "}
              closed or unavailable. Available roles are shown below.
            </p>
          )}
          {jobs.length ? (
            <div className="job-grid">
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          ) : (
            <EmptyState
              title={
                unavailable
                  ? "There’s still possibility ahead."
                  : "Keep a little possibility close."
              }
              description={
                unavailable
                  ? "Your saved roles are currently closed or unavailable. Explore fresh opportunities for your next move."
                  : "Save a role as you browse and find it here when you’re ready for another look."
              }
              action="Explore opportunities"
              href="/jobs"
            />
          )}
        </>
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
  company_snapshot: string;
  location_snapshot: string;
  application_events: {
    id: string;
    event_type: string;
    message?: string;
    source: string;
    occurred_at: string;
  }[];
};
export function Applications() {
  const session = useSession();
  return <ApplicationsForUser key={session.user?.id ?? "signed-out"} />;
}
function ApplicationsForUser() {
  const session = useSession();
  const [apps, setApps] = useState<Application[]>([]);
  const [reportId, setReportId] = useState<string | null>(null);
  const [responded, setResponded] = useState(false);
  const [responseDate, setResponseDate] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function load(signal?: AbortSignal) {
    setBusy(true);
    try {
      const r = await fetch("/api/applications", { cache: "no-store", signal });
      const data = await r.json();
      if (r.ok) setApps(data.applications);
      else setMessage(data.error);
    } catch {
      if (!signal?.aborted)
        setMessage("Your applications couldn’t be loaded. Please try again.");
    } finally {
      setBusy(false);
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
  return (
    <>
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
      {busy ? (
        <p role="status">Loading your applications…</p>
      ) : apps.length ? (
        <div className="panel">
          {apps.map((app) => (
            <article className="application-row" key={app.id}>
              <div>
                <h3>{app.job_title_snapshot}</h3>
                <p>
                  {app.company_snapshot} · {app.location_snapshot}
                </p>
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
                      meaningful response. Reports await moderation before
                      public aggregation.
                    </p>
                    <label
                      className="field-label"
                      htmlFor={`report-reply-${app.id}`}
                      style={{ marginTop: 12 }}
                    >
                      Have you received a meaningful response?
                    </label>
                    <select
                      id={`report-reply-${app.id}`}
                      value={responded ? "yes" : "no"}
                      onChange={(e) => setResponded(e.target.value === "yes")}
                    >
                      <option value="no">No response so far</option>
                      <option value="yes">Yes, I heard back</option>
                    </select>
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
                        <strong>{event.event_type.replaceAll("_", " ")}</strong>
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

export function Account() {
  const session = useSession();
  return <AccountForUser key={session.user?.id ?? "signed-out"} />;
}
function AccountForUser() {
  const session = useSession();
  const [name, setName] = useState("");
  const [cv, setCv] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
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
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setMessage("Your profile couldn’t be loaded.");
      });
    return () => controller.abort();
  }, [session.user?.id]);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const r = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: name, cvText: cv }),
      });
      const data = await r.json();
      setMessage(data.message || data.error);
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
  if (!session.user)
    return (
      <EmptyState
        title="Make yourself at home."
        description="Sign in to manage your profile, CV and application preferences."
      />
    );
  return (
    <>
      <div className="account-grid">
        <form className="panel" onSubmit={save}>
          <h2>Your private profile</h2>
          <p>
            Keep a base CV for your own reference. Each application keeps a
            separate copy of what you submitted.
          </p>
          <label className="field-label" htmlFor="profile-name">
            Your name
          </label>
          <input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            style={{ width: "100%", marginBottom: 20 }}
          />
          <label className="field-label" htmlFor="profile-cv">
            Your base CV text
          </label>
          <textarea
            id="profile-cv"
            value={cv}
            onChange={(e) => setCv(e.target.value)}
            maxLength={40000}
          />
          <p className="fineprint">
            Saving your CV does not make it publicly searchable or send it to
            OpenAI.
          </p>
          <button
            className="button primary"
            style={{ marginTop: 18 }}
            disabled={busy}
          >
            Save profile
            <Check size={16} />
          </button>
        </form>
        <div>
          <section className="panel">
            <span className="badge">
              <ShieldCheck size={13} />
              Private by default
            </span>
            <h2 style={{ marginTop: 20 }}>Your account</h2>
            <p>{session.user.email}</p>
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
            Account export and deletion workflows are required before public
            launch. See our privacy information for the current development
            status.
          </p>
        </div>
      </div>
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
    </>
  );
}
