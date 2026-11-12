"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Plus,
  FileText,
  LoaderCircle,
  Check,
  Eye,
  MessageCircle,
} from "lucide-react";
import { useSession } from "./providers";

type Role = { id: string; title: string; status: string; location: string };
type Membership = {
  organisation_id: string;
  role: string;
  organisations: { id: string; name: string; is_verified: boolean };
};
type Applicant = {
  id: string;
  status: string;
  created_at: string;
  withdrawn_at: string | null;
};
type PrivateApplication = {
  id: string;
  cv_text_snapshot: string;
  cover_letter: string;
  status: string;
  candidate_id: string;
};
export function EmployerWorkspace() {
  const session = useSession();
  return <EmployerWorkspaceForUser key={session.user?.id ?? "signed-out"} />;
}
function EmployerWorkspaceForUser() {
  const session = useSession();
  const [roles, setRoles] = useState<Role[]>([]);
  const [members, setMembers] = useState<Membership[]>([]);
  const postingMembers = members.filter((member) =>
    ["owner", "admin", "recruiter"].includes(member.role),
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(false);
  const [selected, setSelected] = useState("");
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [application, setApplication] = useState<PrivateApplication | null>(
    null,
  );
  const [stage, setStage] = useState("shortlisted");
  const [update, setUpdate] = useState("");
  const reviewVersion = useRef(0);
  const openVersion = useRef(0);
  async function load(signal?: AbortSignal) {
    try {
      const r = await fetch("/api/employers", { cache: "no-store", signal });
      const data = await r.json();
      if (r.ok) {
        setRoles(data.jobs || []);
        setMembers(data.memberships || []);
        if (data.message) setMessage(data.message);
      } else setMessage(data.error);
    } catch {
      if (!signal?.aborted)
        setMessage("The hiring workspace is temporarily unavailable.");
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    if (session.user) void load(controller.signal);
    return () => {
      controller.abort();
      reviewVersion.current++;
      openVersion.current++;
    };
  }, [session.user?.id]);
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!postingMembers.length) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const r = await fetch("/api/employers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organisationId: String(data.get("organisation")),
          title: String(data.get("title")),
          location: `${data.get("city")}, ${data.get("state")}`,
          city: String(data.get("city")),
          state: String(data.get("state")),
          category: String(data.get("category")),
          workMode: String(data.get("workMode")),
          employmentType: String(data.get("employmentType")),
          salaryMin: Number(data.get("salaryMin")),
          salaryMax: Number(data.get("salaryMax")),
          salaryPeriod: String(data.get("salaryPeriod")),
          superIncluded: data.get("superIncluded") === "on",
          description: String(data.get("description")),
          responsibilities: String(data.get("responsibilities") || "")
            .split("\n")
            .filter(Boolean),
          requirements: String(data.get("requirements") || "")
            .split("\n")
            .filter(Boolean),
          skills: String(data.get("skills") || "")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
          publish: data.get("publish") === "on",
        }),
      });
      const result = await r.json();
      setMessage(result.message || result.error);
      if (r.ok) {
        setForm(false);
        await load();
      }
    } catch {
      setMessage("Your role was not saved. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function review(jobId: string) {
    const version = ++reviewVersion.current;
    openVersion.current++;
    setSelected(jobId);
    setApplication(null);
    setApplicants([]);
    setUpdate("");
    try {
      const r = await fetch(
        `/api/employers/applications?job=${encodeURIComponent(jobId)}`,
        { cache: "no-store" },
      );
      const data = await r.json();
      if (version !== reviewVersion.current) return;
      if (r.ok) setApplicants(data.applications);
      else setMessage(data.error);
    } catch {
      if (version === reviewVersion.current)
        setMessage("Applications could not be loaded.");
    }
  }
  async function open(id: string) {
    const version = reviewVersion.current;
    const opening = ++openVersion.current;
    setApplication(null);
    try {
      const r = await fetch("/api/employers/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: id }),
      });
      const data = await r.json();
      if (version !== reviewVersion.current || opening !== openVersion.current)
        return;
      if (r.ok) setApplication(data.application);
      else setMessage(data.error);
    } catch {
      if (version === reviewVersion.current && opening === openVersion.current)
        setMessage("This application could not be opened.");
    }
  }
  async function sendUpdate(event: React.FormEvent) {
    event.preventDefault();
    if (!application) return;
    const version = reviewVersion.current;
    setBusy(true);
    try {
      const r = await fetch("/api/employers/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: application.id,
          status: stage,
          message: update,
        }),
      });
      const data = await r.json();
      if (version !== reviewVersion.current) return;
      setMessage(data.message || data.error);
      if (r.ok) {
        setUpdate("");
        await review(selected);
      }
    } catch {
      setMessage("The candidate update was not recorded. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  if (!session.user)
    return (
      <div className="panel">
        <span className="round-icon">
          <FileText size={25} />
        </span>
        <h2>Your hiring workspace.</h2>
        <p className="muted" style={{ fontSize: 14, margin: "16px 0 22px" }}>
          Sign in to create clear opportunities and keep your candidates
          informed.
        </p>
        <button className="button primary" onClick={session.openAuth}>
          Sign in to start hiring
          <ArrowRight size={17} />
        </button>
        <p className="working-notice">
          Business ownership review is required before a new employer can
          publish. The development preview does not accept live job
          advertisements.
        </p>
      </div>
    );
  return (
    <>
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
      <div className="section-heading">
        <div>
          <p className="eyebrow">Your hiring workspace</p>
          <h2>Good hiring feels human.</h2>
        </div>
        {postingMembers.length > 0 && (
          <button className="button primary" onClick={() => setForm(!form)}>
            <Plus size={17} />
            Create a role
          </button>
        )}
      </div>
      {!members.length ? (
        <div className="panel">
          <h3>Let’s get to know your business first.</h3>
          <p className="muted" style={{ marginTop: 14 }}>
            Your account needs an approved organisation membership before you
            can publish or access applications. Business review and onboarding
            will open with the founding-employer pilot.
          </p>
        </div>
      ) : null}
      {form && (
        <form
          className="panel employer-form"
          onSubmit={create}
          style={{ marginBottom: 25 }}
        >
          <h2 style={{ fontSize: 26 }}>A clear role is a great beginning.</h2>
          <label className="field-label">
            Hiring business
            <select name="organisation" required>
              {postingMembers.map((m) => (
                <option value={m.organisation_id} key={m.organisation_id}>
                  {m.organisations.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Role title
            <input
              name="title"
              required
              minLength={3}
              maxLength={180}
              placeholder="e.g. Customer Success Manager"
            />
          </label>
          <div className="account-grid">
            <label className="field-label">
              City or suburb
              <input name="city" required />
            </label>
            <label className="field-label">
              State or territory
              <select name="state">
                {["VIC", "NSW", "QLD", "WA", "SA", "TAS", "ACT", "NT"].map(
                  (s) => (
                    <option key={s}>{s}</option>
                  ),
                )}
              </select>
            </label>
          </div>
          <label className="field-label">
            Category
            <input name="category" required placeholder="e.g. Technology" />
          </label>
          <div className="account-grid">
            <label className="field-label">
              Working arrangement
              <select name="workMode">
                {["Hybrid", "Remote", "On-site"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Employment type
              <select name="employmentType">
                {["Full time", "Part time", "Contract", "Casual"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="account-grid">
            <label className="field-label">
              Minimum salary (A$)
              <input
                name="salaryMin"
                type="number"
                min={0}
                max={100000000}
                step="0.01"
                required
              />
            </label>
            <label className="field-label">
              Maximum salary (A$)
              <input
                name="salaryMax"
                type="number"
                min={0}
                max={100000000}
                step="0.01"
                required
              />
            </label>
          </div>
          <label className="field-label">
            Pay period
            <select name="salaryPeriod">
              <option value="year">Per year</option>
              <option value="hour">Per hour</option>
            </select>
          </label>
          <label className="checkbox-label">
            <input name="superIncluded" type="checkbox" />
            These amounts include superannuation
          </label>
          <label className="field-label">
            The opportunity
            <textarea
              name="description"
              required
              minLength={20}
              maxLength={20000}
            />
          </label>
          <label className="field-label">
            Responsibilities — one per line
            <textarea name="responsibilities" />
          </label>
          <label className="field-label">
            Requirements — one per line
            <textarea name="requirements" />
          </label>
          <label className="field-label">
            Skills — separated by commas
            <input
              name="skills"
              placeholder="Communication, CRM, Account management"
            />
          </label>
          <label className="checkbox-label">
            <input type="checkbox" name="publish" />
            Publish immediately (verified businesses only); otherwise save a
            draft
          </label>
          <p className="fineprint">
            Check pay against the applicable award or agreement. Only include
            requirements relevant to performing the work.
          </p>
          <button className="button primary" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Check size={16} />
            )}
            Save this opportunity
          </button>
        </form>
      )}
      {roles.length > 0 && (
        <div className="panel">
          {roles.map((role) => (
            <div className="application-row" key={role.id}>
              <div>
                <h3>{role.title}</h3>
                <p>
                  {role.location} · {role.status}
                </p>
              </div>
              <button
                className="button secondary small"
                onClick={() => review(role.id)}
              >
                Review applicants
                <ArrowRight size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
      {selected && (
        <section className="panel" style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 25 }}>
            People interested in your opportunity.
          </h2>
          <p className="fineprint" style={{ marginTop: 12 }}>
            Opening an application records a timestamp visible to its candidate.
            Loading this list does not.
          </p>
          {applicants.length ? (
            applicants.map((a, index) => (
              <div className="application-row" key={a.id}>
                <div>
                  <h3>Application {index + 1}</h3>
                  <p>
                    {new Date(a.created_at).toLocaleDateString("en-AU")} ·{" "}
                    {a.withdrawn_at ? "Withdrawn" : a.status}
                  </p>
                </div>
                {!a.withdrawn_at && (
                  <button
                    className="button secondary small"
                    onClick={() => open(a.id)}
                  >
                    <Eye size={15} />
                    Open application
                  </button>
                )}
              </div>
            ))
          ) : (
            <p className="muted" style={{ marginTop: 20 }}>
              No applications to review yet.
            </p>
          )}
        </section>
      )}
      {application && (
        <section className="panel" style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 25 }}>Their experience, in their words.</h2>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              font: "inherit",
              fontSize: 13,
              marginTop: 22,
              color: "var(--muted)",
            }}
          >
            {application.cv_text_snapshot}
          </pre>
          {application.cover_letter && (
            <>
              <h3 style={{ marginTop: 22 }}>Cover letter</h3>
              <p
                style={{ whiteSpace: "pre-wrap", fontSize: 13, marginTop: 12 }}
              >
                {application.cover_letter}
              </p>
            </>
          )}
          <form onSubmit={sendUpdate} style={{ marginTop: 30 }}>
            <label className="field-label" htmlFor="candidate-stage">
              Next stage
            </label>
            <select
              id="candidate-stage"
              value={stage}
              onChange={(e) => setStage(e.target.value)}
            >
              <option value="shortlisted">Shortlisted</option>
              <option value="interview">Interview</option>
              <option value="offer">Offer</option>
              <option value="not_proceeding">Not proceeding</option>
            </select>
            <label
              className="field-label"
              htmlFor="candidate-update"
              style={{ marginTop: 15 }}
            >
              A useful update for this candidate
            </label>
            <textarea
              id="candidate-update"
              minLength={10}
              maxLength={4000}
              required
              value={update}
              onChange={(e) => setUpdate(e.target.value)}
              placeholder="Let them know what happens next…"
            />
            <button
              className="button primary"
              style={{ marginTop: 15 }}
              disabled={busy}
            >
              <MessageCircle size={16} />
              Record update for candidate
            </button>
            <p className="fineprint" style={{ marginTop: 12 }}>
              This records an in-app timeline update. Email delivery is not yet
              enabled.
            </p>
          </form>
        </section>
      )}
    </>
  );
}
