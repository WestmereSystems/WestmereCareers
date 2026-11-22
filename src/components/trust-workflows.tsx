"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { VerificationProgress } from "./verification-progress";
import { useSession } from "./providers";
import { PageControls } from "./page-controls";
import type { BusinessRegistrationCapacity } from "@/lib/business-registration";

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
  requested_kind?: "employer" | "agency";
  agency_specialisms?: string[];
  agency_regions?: string[];
  abn: string;
  website: string;
  contact_role: string;
  ownership_evidence: string;
  linkedin_url?: string;
  hr_email?: string;
  hr_phone?: string;
  contact_source?: string;
  status: string;
  applicant_message: string;
  created_at: string;
};
export function VerificationIntake() {
  const session = useSession();
  const [requests, setRequests] = useState<Verification[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [businessPage, setBusinessPage] = useState(1);
  const [businessTotal, setBusinessTotal] = useState(0);
  const [capacity, setCapacity] = useState<BusinessRegistrationCapacity | null>(
    null,
  );
  const [verifiedBusinesses, setVerifiedBusinesses] = useState<
    {
      role: string;
      organisations: { id: string; name: string; suspended_at: string | null };
    }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Verification | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [newBusiness, setNewBusiness] = useState(false);
  useEffect(() => {
    setNewBusiness(
      new URLSearchParams(window.location.search).get("newBusiness") === "1",
    );
  }, []);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const r = await fetch(
          `/api/employers/verification?page=${page}&businessPage=${businessPage}`,
          {
            cache: "no-store",
            signal,
          },
        );
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setRequests(d.requests);
        setTotal(d.total ?? d.requests.length);
        setVerifiedBusinesses(d.verifiedBusinesses || []);
        setBusinessTotal(d.businessTotal || 0);
        setCapacity(d.capacity || null);
      } catch (e) {
        if (!signal?.aborted)
          setMessage(
            e instanceof Error ? e.message : "Requests could not be loaded.",
          );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [page, businessPage],
  );
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
        kind: f.get("kind"),
        specialisms: String(f.get("specialisms") || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        regions: String(f.get("regions") || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        businessName: f.get("name"),
        abn: String(f.get("abn")).replace(/\s/g, ""),
        website: f.get("website"),
        contactRole: f.get("role"),
        evidence: f.get("evidence"),
        linkedin: f.get("linkedin"),
        hrEmail: f.get("hrEmail"),
        hrPhone: f.get("hrPhone"),
        contactSource: f.get("contactSource"),
        contactPermission: f.get("contactPermission") === "on",
      });
      setMessage(d.message);
      setEditing(null);
      form.reset();
      await load();
      await session.refresh();
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
        passwords, identity documents or candidate information here. We aim to
        review a complete submission within 48 hours. More information may be
        needed before approval.
      </p>
      <Message>{message}</Message>
      <section
        aria-label="Verified businesses"
        className="verification-business-list"
        aria-busy={loading}
      >
        <h3>Verified businesses</h3>
        {verifiedBusinesses.map(({ role, organisations: o }) => (
          <article className="activity-item" key={o.id}>
            <h4>{o.name}</h4>
            <VerificationProgress status="approved" />
            <p>
              {o.suspended_at
                ? "Business verified · hiring access suspended"
                : "Business verified"}
              {role !== "owner" ? " · managed by invitation" : ""}
            </p>
          </article>
        ))}
        {!businessTotal && !loading && (
          <p className="muted">
            Your approved businesses will appear here after verification.
          </p>
        )}
        <PageControls
          page={businessPage}
          total={businessTotal}
          size={5}
          label="Verified businesses pages"
          onPage={setBusinessPage}
          busy={loading}
        />
      </section>
      <h3>Verification requests</h3>
      {requests.map((r) => (
        <article className="activity-item" key={r.id}>
          <h3>{r.business_name}</h3>
          <VerificationProgress status={r.status} />
          <p>Submitted {new Date(r.created_at).toLocaleDateString("en-AU")}</p>
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
      <PageControls
        page={page}
        total={total}
        size={5}
        label="Verification request pages"
        onPage={setPage}
        busy={loading}
      />
      {capacity && (
        <p className="notice" role="status">
          Business allowance: {capacity.used} of {capacity.limit} slots used (
          {capacity.owned} existing businesses and {capacity.pending} pending
          reviews).
          {!capacity.canSubmit && (
            <>
              {" "}
              Your allowance is full.{" "}
              <Link href="/account?tab=billing">
                Review your subscription
              </Link>{" "}
              before submitting another business. You can still respond to
              requests for information.
            </>
          )}
        </p>
      )}
      {!editing && !capacity && (
        <p role="status">
          {loading
            ? "Checking your business allowance…"
            : "Your allowance could not be checked. Refresh before submitting a new business."}
        </p>
      )}
      {(Boolean(editing) || Boolean(capacity?.canSubmit)) && (
        <details
          id="new-business"
          open={newBusiness || Boolean(editing) || requests.length === 0}
        >
          <summary>
            {editing ? "Update your request" : "Submit a business for review"}
          </summary>
          <form
            className="form-stack"
            key={editing?.id ?? "new"}
            onSubmit={submit}
          >
            <label className="field-label">
              Business type
              <select
                name="kind"
                defaultValue={
                  editing?.requested_kind ||
                  session.business?.kind ||
                  "employer"
                }
              >
                <option value="employer">
                  Employer · hiring for your own business
                </option>
                <option value="agency">
                  Recruitment agency · hiring for clients
                </option>
              </select>
            </label>
            <div className="form-grid">
              <label className="field-label">
                Agency specialisms (comma separated)
                <input
                  name="specialisms"
                  maxLength={1000}
                  defaultValue={editing?.agency_specialisms?.join(", ")}
                  placeholder="Required for agencies, e.g. Technology, Finance"
                />
              </label>
              <label className="field-label">
                Agency service regions (comma separated)
                <input
                  name="regions"
                  maxLength={1000}
                  defaultValue={editing?.agency_regions?.join(", ")}
                  placeholder="Required for agencies, e.g. NSW, ACT"
                />
              </label>
            </div>
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
            <label className="field-label">
              Business or authorised representative’s LinkedIn profile
              <input
                name="linkedin"
                type="url"
                required
                pattern="https://.*"
                maxLength={500}
                defaultValue={editing?.linkedin_url}
                placeholder="https://www.linkedin.com/company/your-company/"
              />
            </label>
            <div className="form-grid">
              <label className="field-label">
                Public HR or business verification email
                <input
                  name="hrEmail"
                  type="email"
                  required
                  maxLength={254}
                  defaultValue={editing?.hr_email}
                />
              </label>
              <label className="field-label">
                Public HR or business verification phone
                <input
                  name="hrPhone"
                  type="tel"
                  required
                  minLength={6}
                  maxLength={40}
                  defaultValue={editing?.hr_phone}
                />
              </label>
            </div>
            <label className="field-label">
              Public page listing these contact details
              <input
                name="contactSource"
                type="url"
                required
                pattern="https://.*"
                maxLength={500}
                defaultValue={editing?.contact_source}
                placeholder="https://your-company.com.au/contact"
              />
            </label>
            <label className="checkbox-label">
              <input name="contactPermission" type="checkbox" required />I am
              authorised to supply these publicly listed business contact
              details and permit Westmere to contact this business to check my
              identity and hiring authority.
            </label>
            <p className="fineprint">
              These verification contacts are available to authorised reviewers.
              They are not added to your public company profile or used for
              marketing. See our <Link href="/privacy">Privacy Policy</Link>.
            </p>
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
      )}
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

export function ResponseChoices({
  value,
  onChange,
  name = "response",
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  name?: string;
}) {
  return (
    <fieldset className="response-choices">
      <legend>Did you receive a meaningful employer response?</legend>
      {[
        { value: true, label: "I received a meaningful employer response" },
        {
          value: false,
          label: "I did not receive a meaningful employer response",
        },
      ].map((o) => (
        <label
          className={`response-choice ${value === o.value ? "selected" : ""}`}
          key={String(o.value)}
        >
          <input
            type="radio"
            name={name}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}
type ReviewRole = {
  id: string;
  title: string;
  source: string;
  closed: boolean;
  reviewed: boolean;
  application_id: string | null;
};
export function ResponseReportForm({
  organisationId,
}: {
  organisationId: string;
}) {
  const session = useSession(),
    [roles, setRoles] = useState<ReviewRole[]>([]),
    [roleId, setRoleId] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [responded, setResponded] = useState(false),
    [loading, setLoading] = useState(false);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      try {
        const r = await fetch(
          `/api/applications/reports?organisationId=${organisationId}`,
          { cache: "no-store", signal },
        );
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setRoles(d.roles || []);
      } catch (e) {
        if (!signal?.aborted)
          setMessage(
            e instanceof Error
              ? e.message
              : "Role history could not be loaded.",
          );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [organisationId],
  );
  useEffect(() => {
    if (!session.user) return;
    const c = new AbortController();
    void load(c.signal);
    return () => c.abort();
  }, [load, session.user?.id]);
  const selected = roles.find((r) => r.id === roleId);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected || selected.reviewed) return;
    const form = e.currentTarget,
      f = new FormData(form);
    setBusy(true);
    try {
      const d = await sendJson("/api/applications/reports", {
        ...(selected.application_id
          ? { applicationId: selected.application_id }
          : {
              organisationId,
              jobReference: selected.id,
              applicationDate: new Date(String(f.get("applied"))).toISOString(),
            }),
        responseReceived: responded,
        responseDate: responded
          ? new Date(String(f.get("replied"))).toISOString()
          : null,
      });
      setMessage(d.message);
      form.reset();
      setRoleId("");
      setResponded(false);
      await load();
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
        Choose a position this business published in the last six months,
        including closed roles. Each job title can be reviewed once. On-site
        figures come from recorded employer responses; matching feedback dates
        can be affirmed. Off-site experiences are self-reported.
      </p>
      {session.user ? (
        <form className="form-stack" onSubmit={submit}>
          <label className="field-label">
            Position
            <select
              required
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              disabled={loading}
            >
              <option value="">
                {loading ? "Loading role history…" : "Choose a position"}
              </option>
              {roles.map((r) => (
                <option
                  key={r.id}
                  value={r.id}
                  disabled={
                    r.reviewed || (r.source === "direct" && !r.application_id)
                  }
                >
                  {r.title}
                  {r.closed ? " · Closed" : ""}
                  {r.reviewed
                    ? " · Already reviewed"
                    : r.source === "direct" && !r.application_id
                      ? " · Recorded application required"
                      : ""}
                </option>
              ))}
            </select>
          </label>
          {!loading && !roles.length && (
            <p className="fineprint">
              No positions were published in the last six months.
            </p>
          )}
          {selected?.source === "external" && (
            <label className="field-label">
              When did you apply?
              <input name="applied" type="datetime-local" required />
            </label>
          )}
          <ResponseChoices
            value={responded}
            onChange={setResponded}
            name={`response-${organisationId}`}
          />
          {responded && (
            <label className="field-label">
              When did they first respond?
              <input name="replied" type="datetime-local" required />
            </label>
          )}
          <button
            className="button secondary"
            disabled={busy || !selected || selected.reviewed}
          >
            Save my experience
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
  corroborated?: boolean | null;
};
function TrustActivityForUser() {
  const session = useSession();
  const [reports, setReports] = useState<Report[]>([]),
    [message, setMessage] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const results = await Promise.all([
        fetch("/api/applications/reports", { cache: "no-store", signal }),
      ]);
      const [b] = await Promise.all(results.map((r) => r.json()));
      if (!results[0].ok) throw new Error(b.error);
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
        { reportId: r.id },
        "PATCH",
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
        <h2>Your response reports</h2>
        <p className="muted">
          Off-site no-response reports can be reconfirmed here without creating
          another review. They need confirmation within the last 30 days to
          contribute to public statistics. On-site figures use recorded
          activity.
        </p>
        {!reports.length && <p>No reports submitted yet.</p>}
        {reports.map((r) => (
          <article className="activity-item" key={r.id}>
            <h3>{r.job_reference}</h3>
            <p>
              {r.response_received
                ? "Response received"
                : "No response reported"}{" "}
              ·{" "}
              {r.corroborated
                ? "Affirmed against recorded activity"
                : r.moderation_status}{" "}
              · Confirmed {new Date(r.confirmed_at).toLocaleDateString("en-AU")}
            </p>
            <div className="actions-row">
              {!r.response_received && !r.application_id && (
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
