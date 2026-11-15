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
import Link from "next/link";
import { EmployerBranding, ListingDocuments } from "./employer-branding";
import { useSession } from "./providers";
import { VerificationIntake, TrustCaseForm, sendJson } from "./trust-workflows";

type Role = {
  id: string;
  title: string;
  status: string;
  location: string;
  moderation_status: string;
  publication_requested: boolean;
  organisation_id: string;
  city: string;
  state: string;
  category: string;
  work_mode: string;
  employment_type: string;
  salary_min: number;
  salary_max: number;
  salary_period: string;
  super_included: boolean;
  description: string;
  responsibilities: string[];
  requirements: string[];
  skills: string[];
  contact_email?: string | null;
  listing_documents?: { id: string; filename: string; bytes: number }[];
  listing_review_feedback: { message: string } | null;
};
type Membership = {
  organisation_id: string;
  role: string;
  organisations: {
    id: string;
    name: string;
    is_verified: boolean;
    suspended_at: string | null;
    description?: string;
    careers_email?: string | null;
    avatar_path?: string | null;
    banner_path?: string | null;
  };
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
  const postingMembers = members.filter(
    (member) =>
      ["owner", "admin", "recruiter"].includes(member.role) &&
      !member.organisations.suspended_at,
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  useEffect(() => {
    if (form)
      document
        .getElementById("role-editor")
        ?.scrollIntoView({ block: "start" });
  }, [form, editing?.id]);
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
          ...(editing ? { id: editing.id } : {}),
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
          contactEmail: String(data.get("contactEmail") || ""),
          publish: data.get("publish") === "on",
        }),
      });
      const result = await r.json();
      setMessage(result.message || result.error);
      if (r.ok) {
        setForm(false);
        setEditing(null);
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
  if (session.loading)
    return <p role="status">Loading your hiring workspace…</p>;
  if (!session.user)
    return (
      <div className="panel">
        <span className="round-icon">
          <FileText size={25} />
        </span>
        <h2>Your hiring workspace.</h2>
        <p className="muted" style={{ fontSize: 16, margin: "16px 0 22px" }}>
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
          <button
            className="button primary"
            onClick={() => {
              setEditing(null);
              setForm(!form);
            }}
          >
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
            can publish or access applications. Submit the business details
            below for independent review.
          </p>
        </div>
      ) : null}
      <p>
        <Link className="text-link" href="/notifications">
          View hiring notifications →
        </Link>
      </p>
      {session.sampleWorkspace && (
        <p className="notice">
          <Link href="/employers/sample">
            Open your private sample hiring workspace
          </Link>
        </p>
      )}
      <VerificationIntake />
      {members.map((m) => (
        <div key={m.organisation_id} className="panel">
          <h3>{m.organisations.name}</h3>
          <p>
            {m.organisations.suspended_at
              ? "Hiring access is suspended pending review."
              : m.organisations.is_verified
                ? "Business identity and hiring authority checked."
                : "Business verification pending."}
          </p>
          {m.organisations.is_verified &&
            !m.organisations.suspended_at &&
            ["owner", "admin"].includes(m.role) && (
              <EmployerBranding
                organisation={m.organisations}
                onSaved={() => void load()}
              />
            )}
          <TrustCaseForm organisationId={m.organisation_id} />
        </div>
      ))}
      {form && (
        <form
          className="panel employer-form"
          key={editing?.id ?? "new"}
          id="role-editor"
          onSubmit={create}
          style={{ marginBottom: 25 }}
        >
          <h2 style={{ fontSize: 26 }}>
            {editing
              ? "Refine your opportunity."
              : "A clear role is a great beginning."}
          </h2>
          {editing && (
            <p className="notice">
              Saving changes returns this listing to a private draft for
              independent review.
            </p>
          )}
          <label className="field-label">
            Hiring business
            <select
              name="organisation"
              required
              defaultValue={editing?.organisation_id}
            >
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
              defaultValue={editing?.title}
              required
              minLength={3}
              maxLength={180}
              placeholder="e.g. Customer Success Manager"
            />
          </label>
          <div className="account-grid">
            <label className="field-label">
              City or suburb
              <input name="city" defaultValue={editing?.city} required />
            </label>
            <label className="field-label">
              State or territory
              <select name="state" defaultValue={editing?.state}>
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
            <input
              name="category"
              defaultValue={editing?.category}
              required
              placeholder="e.g. Technology"
            />
          </label>
          <div className="account-grid">
            <label className="field-label">
              Working arrangement
              <select name="workMode" defaultValue={editing?.work_mode}>
                {["Hybrid", "Remote", "On-site"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Employment type
              <select
                name="employmentType"
                defaultValue={editing?.employment_type}
              >
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
                defaultValue={editing?.salary_min}
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
                defaultValue={editing?.salary_max}
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
            <select name="salaryPeriod" defaultValue={editing?.salary_period}>
              <option value="year">Per year</option>
              <option value="hour">Per hour</option>
            </select>
          </label>
          <label className="checkbox-label">
            <input
              name="superIncluded"
              type="checkbox"
              defaultChecked={editing?.super_included}
            />
            These amounts include superannuation
          </label>
          <label className="field-label">
            The opportunity · rich text
            <textarea
              placeholder="Use ## for headings, - for bullet points and **bold** for emphasis."
              name="description"
              defaultValue={editing?.description}
              required
              minLength={20}
              maxLength={20000}
            />
          </label>
          <p className="fineprint">
            Formatting: ## heading, - bullet point, **bold**. HTML and embedded
            links are shown as text.
          </p>
          <label className="field-label">
            Contact email for this listing · optional
            <input
              name="contactEmail"
              type="email"
              maxLength={254}
              defaultValue={editing?.contact_email || ""}
            />
            <span className="fineprint">
              Public, revealed by click. Use a work address you are authorised
              to publish.
            </span>
          </label>
          <label className="field-label">
            Responsibilities — one per line
            <textarea
              name="responsibilities"
              defaultValue={editing?.responsibilities?.join("\n")}
            />
          </label>
          <label className="field-label">
            Requirements — one per line
            <textarea
              name="requirements"
              defaultValue={editing?.requirements?.join("\n")}
            />
          </label>
          <label className="field-label">
            Skills — separated by commas
            <input
              name="skills"
              defaultValue={editing?.skills?.join(", ")}
              placeholder="Communication, CRM, Account management"
            />
          </label>
          <label className="checkbox-label">
            <input type="checkbox" name="publish" />
            Submit for publication review (verified businesses only); otherwise
            save a draft
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
                <ListingDocuments role={role} onSaved={() => void load()} />
                <p>
                  {role.location} · {role.status} ·{" "}
                  {role.publication_requested
                    ? "Awaiting review"
                    : role.moderation_status}
                </p>
              </div>
              <div className="actions-row">
                <button
                  className="button secondary"
                  onClick={() => {
                    setEditing(role);
                    setForm(true);
                  }}
                >
                  Edit listing
                </button>
                {role.listing_review_feedback?.message && (
                  <p className="fineprint">
                    Reviewer feedback: {role.listing_review_feedback.message}
                  </p>
                )}
                {role.status !== "published" && !role.publication_requested && (
                  <button
                    className="button secondary"
                    onClick={async () => {
                      try {
                        const d = await sendJson(
                          "/api/employers",
                          { id: role.id, action: "submit" },
                          "PATCH",
                        );
                        setMessage(d.message);
                        await load();
                      } catch (e) {
                        setMessage(
                          e instanceof Error ? e.message : "Please try again.",
                        );
                      }
                    }}
                  >
                    Submit for review
                  </button>
                )}
                {role.status !== "closed" && (
                  <button
                    className="button secondary"
                    onClick={async () => {
                      try {
                        const d = await sendJson(
                          "/api/employers",
                          { id: role.id, action: "close" },
                          "PATCH",
                        );
                        setMessage(d.message);
                        await load();
                      } catch (e) {
                        setMessage(
                          e instanceof Error ? e.message : "Please try again.",
                        );
                      }
                    }}
                  >
                    Close listing
                  </button>
                )}
                <button
                  className="button secondary small"
                  onClick={() => review(role.id)}
                >
                  Review applicants
                  <ArrowRight size={15} />
                </button>
              </div>
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
              fontSize: 15,
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
                style={{ whiteSpace: "pre-wrap", fontSize: 15, marginTop: 12 }}
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
