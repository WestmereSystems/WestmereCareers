"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "./providers";

export async function sendJson(url: string, body: unknown, method = "POST") {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Please try again.");
  return data;
}
function Message({ children }: { children: string }) {
  return children ? (
    <p className="message" role="status">
      {children}
    </p>
  ) : null;
}
type Verification = {
  id: string;
  business_name: string;
  abn: string;
  website: string;
  contact_role: string;
  ownership_evidence: string;
  status: string;
  applicant_message: string;
  created_at: string;
};
export function VerificationIntake() {
  const session = useSession();
  const [requests, setRequests] = useState<Verification[]>([]);
  const [editing, setEditing] = useState<Verification | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const r = await fetch("/api/employers/verification", {
        cache: "no-store",
        signal,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setRequests(d.requests);
    } catch (e) {
      if (!signal?.aborted)
        setMessage(
          e instanceof Error ? e.message : "Requests could not be loaded.",
        );
    }
  }, []);
  useEffect(() => {
    const c = new AbortController();
    if (session.user) void load(c.signal);
    return () => c.abort();
  }, [session.user?.id, load]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const d = await sendJson("/api/employers/verification", {
        requestId: editing?.id ?? null,
        businessName: f.get("name"),
        abn: String(f.get("abn")).replace(/\s/g, ""),
        website: f.get("website"),
        contactRole: f.get("role"),
        evidence: f.get("evidence"),
      });
      setMessage(d.message);
      setEditing(null);
      form.reset();
      await load();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Request could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!session.user) return null;
  return (
    <section className="panel trust-intake">
      <p className="eyebrow">A good first introduction</p>
      <h2>Verify your business.</h2>
      <p className="muted">
        We check the business identity and your authority to hire before giving
        publishing access. An ABN alone does not prove ownership. Never include
        passwords, identity documents or candidate information here.
      </p>
      <Message>{message}</Message>
      {requests.map((r) => (
        <article className="activity-item" key={r.id}>
          <h3>{r.business_name}</h3>
          <p>
            {r.status.replaceAll("_", " ")} · Submitted{" "}
            {new Date(r.created_at).toLocaleDateString("en-AU")}
          </p>
          {r.applicant_message && (
            <p className="notice">Reviewer feedback: {r.applicant_message}</p>
          )}
          {r.status === "needs_information" && (
            <button className="button secondary" onClick={() => setEditing(r)}>
              Add requested information
            </button>
          )}
        </article>
      ))}
      <details open={Boolean(editing) || requests.length === 0}>
        <summary>
          {editing ? "Update your request" : "Submit a business for review"}
        </summary>
        <form
          className="form-stack"
          key={editing?.id ?? "new"}
          onSubmit={submit}
        >
          <label className="field-label">
            Registered business name
            <input
              name="name"
              required
              minLength={2}
              maxLength={180}
              defaultValue={editing?.business_name}
            />
          </label>
          <div className="form-grid">
            <label className="field-label">
              ABN (11 digits)
              <input
                name="abn"
                required
                inputMode="numeric"
                pattern="[0-9 ]{11,14}"
                maxLength={14}
                defaultValue={editing?.abn}
              />
            </label>
            <label className="field-label">
              Your role at the business
              <input
                name="role"
                required
                minLength={2}
                maxLength={120}
                defaultValue={editing?.contact_role}
              />
            </label>
          </div>
          <label className="field-label">
            Business website (https://)
            <input
              name="website"
              type="url"
              pattern="https://.*"
              required
              maxLength={500}
              placeholder="https://your-business.com.au"
              defaultValue={editing?.website}
            />
          </label>
          <label className="field-label">
            How can we independently confirm your authority?
            <textarea
              name="evidence"
              minLength={30}
              maxLength={4000}
              required
              defaultValue={editing?.ownership_evidence}
              placeholder="Describe your relationship to the business and a public business contact or company-domain verification route. A reviewer will follow up if more evidence is needed."
            />
          </label>
          <button className="button primary" disabled={busy}>
            {busy ? "Submitting…" : "Submit for independent review"}
          </button>
          {editing && (
            <button
              className="button secondary"
              type="button"
              onClick={() => setEditing(null)}
            >
              Cancel edit
            </button>
          )}
        </form>
      </details>
      <p className="fineprint">
        Verification confirms identity and hiring authority; it is not an
        endorsement of every role or workplace. Existing business ownership
        changes require a separate review.
      </p>
    </section>
  );
}

export function TrustCaseForm({
  organisationId,
  jobId,
}: {
  organisationId: string;
  jobId?: string;
}) {
  const session = useSession();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    setBusy(true);
    try {
      const d = await sendJson("/api/trust/cases", {
        organisationId,
        jobId: jobId ?? null,
        kind: f.get("kind"),
        detail: f.get("detail"),
      });
      setMessage(d.message);
      form.reset();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Your concern could not be recorded.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="trust-disclosure">
      <summary>Report a concern or appeal response insights</summary>
      <p className="fineprint">
        Reports are private and reviewed by someone independent of the business.
        Response appeals are available to its authorised owners and
        administrators.
      </p>
      {session.user ? (
        <form className="form-stack" onSubmit={submit}>
          <label className="field-label">
            What would you like reviewed?
            <select name="kind">
              <option value={jobId ? "listing_concern" : "business_concern"}>
                {jobId ? "This listing" : "This business"}
              </option>
              <option value="response_appeal">
                Employer appeal of response insights
              </option>
            </select>
          </label>
          <label className="field-label">
            Details and supporting context
            <textarea
              name="detail"
              minLength={20}
              maxLength={4000}
              required
              placeholder="Describe the issue and relevant dates. Avoid sensitive personal information."
            />
          </label>
          <button className="button secondary" disabled={busy}>
            Submit privately
          </button>
          <Link className="text-link" href="/trust-activity">
            View my trust activity
          </Link>
        </form>
      ) : (
        <button className="button secondary" onClick={session.openAuth}>
          Sign in to report privately
        </button>
      )}
      <Message>{message}</Message>
    </details>
  );
}

export function ResponseReportForm({
  organisationId,
}: {
  organisationId: string;
}) {
  const session = useSession(),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [responded, setResponded] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    setBusy(true);
    try {
      const d = await sendJson("/api/applications/reports", {
        organisationId,
        jobReference: f.get("reference"),
        applicationDate: new Date(String(f.get("applied"))).toISOString(),
        responseReceived: responded,
        responseDate: responded
          ? new Date(String(f.get("replied"))).toISOString()
          : null,
      });
      setMessage(d.message);
      form.reset();
      setResponded(false);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Check the dates and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="trust-disclosure">
      <summary>Share your application experience</summary>
      <p className="fineprint">
        For applications made outside Westmere. Report a meaningful employer
        reply, rather than an automated receipt. To update an experience, use
        the same job reference. Internal applications can be reported from My
        applications.
      </p>
      {session.user ? (
        <form className="form-stack" onSubmit={submit}>
          <label className="field-label">
            Job title or reference
            <input name="reference" minLength={3} maxLength={300} required />
          </label>
          <label className="field-label">
            When did you apply?
            <input name="applied" type="datetime-local" required />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={responded}
              onChange={(e) => setResponded(e.target.checked)}
            />
            I received a meaningful employer response
          </label>
          {responded && (
            <label className="field-label">
              When did they respond?
              <input name="replied" type="datetime-local" required />
            </label>
          )}
          <button className="button secondary" disabled={busy}>
            Save my experience for review
          </button>
        </form>
      ) : (
        <button className="button secondary" onClick={session.openAuth}>
          Sign in to share an experience
        </button>
      )}
      <Message>{message}</Message>
    </details>
  );
}

type Case = {
  id: string;
  kind: string;
  detail: string;
  status: string;
  resolution: string;
  created_at: string;
};
type Report = {
  id: string;
  organisation_id: string;
  application_id: string | null;
  job_reference: string;
  application_date: string;
  response_received: boolean;
  confirmed_at: string;
  moderation_status: string;
};
function TrustActivityForUser() {
  const session = useSession();
  const [cases, setCases] = useState<Case[]>([]),
    [reports, setReports] = useState<Report[]>([]),
    [message, setMessage] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const results = await Promise.all([
        fetch("/api/trust/cases", { cache: "no-store", signal }),
        fetch("/api/applications/reports", { cache: "no-store", signal }),
      ]);
      const [a, b] = await Promise.all(results.map((r) => r.json()));
      if (!results[0].ok || !results[1].ok) throw new Error(a.error || b.error);
      setCases(a.cases);
      setReports(b.reports);
    } catch (e) {
      if (!signal?.aborted)
        setMessage(e instanceof Error ? e.message : "Activity is unavailable.");
    }
  }, []);
  useEffect(() => {
    const c = new AbortController();
    if (session.user) void load(c.signal);
    return () => c.abort();
  }, [session.user?.id, load]);
  async function reconfirm(r: Report) {
    try {
      const d = await sendJson(
        "/api/applications/reports",
        r.application_id
          ? { applicationId: r.application_id, responseReceived: false }
          : {
              organisationId: r.organisation_id,
              jobReference: r.job_reference,
              applicationDate: r.application_date,
              responseReceived: false,
            },
      );
      setMessage(d.message);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Please try again.");
    }
  }
  if (session.loading) return <p role="status">Loading your account…</p>;
  if (!session.user)
    return (
      <button className="button primary" onClick={session.openAuth}>
        Sign in to see your private activity
      </button>
    );
  return (
    <>
      <Message>{message}</Message>
      <section className="panel">
        <h2>Your concerns and appeals</h2>
        {!cases.length && <p>No cases submitted yet.</p>}
        {cases.map((c) => (
          <article className="activity-item" key={c.id}>
            <h3>{c.kind.replaceAll("_", " ")}</h3>
            <p className="badge">{c.status.replaceAll("_", " ")}</p>
            <p>{c.detail}</p>
            {c.resolution && (
              <p className="notice">Reviewer update: {c.resolution}</p>
            )}
          </article>
        ))}
      </section>
      <section className="panel">
        <h2>Your response reports</h2>
        <p className="muted">
          Corrections and fresh confirmations return to review. Silence reports
          need confirmation within the last 30 days to contribute to public
          statistics.
        </p>
        {!reports.length && <p>No reports submitted yet.</p>}
        {reports.map((r) => (
          <article className="activity-item" key={r.id}>
            <h3>{r.job_reference}</h3>
            <p>
              {r.response_received
                ? "Response received"
                : "No response reported"}{" "}
              · {r.moderation_status} · Confirmed{" "}
              {new Date(r.confirmed_at).toLocaleDateString("en-AU")}
            </p>
            <div className="actions-row">
              <Link
                className="text-link"
                href={
                  r.application_id
                    ? "/applications"
                    : `/companies/${r.organisation_id}`
                }
              >
                Update or correct this experience
              </Link>
              {!r.response_received && (
                <button
                  className="button secondary"
                  onClick={() => void reconfirm(r)}
                >
                  Confirm I am still waiting
                </button>
              )}
            </div>
          </article>
        ))}
      </section>
    </>
  );
}

export function TrustActivity() {
  const session = useSession();
  return <TrustActivityForUser key={session.user?.id ?? "signed-out"} />;
}
