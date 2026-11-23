"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { sendJson } from "./trust-workflows";
type Scope = {
  authorisations: {
    id: string;
    status: string;
    valid_from: string;
    valid_until: string;
    client: { public_label: string };
  }[];
  members: { id: string; email: string; role: string }[];
  engagements: {
    job_id: string;
    authorisation_id: string | null;
    lead_user_id: string;
  }[];
  assignments: { job_id: string; user_id: string; revoked_at: string | null }[];
};
export function AgencyRoleFields({
  organisationId,
  jobId,
  mode = "internal",
  leadName = "",
}: {
  organisationId: string;
  jobId?: string;
  mode?: string;
  leadName?: string;
}) {
  const [scope, setScope] = useState<Scope | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const [hiringMode, setHiringMode] = useState(mode);
  useEffect(() => {
    const c = new AbortController();
    fetch(`/api/employers/agency?organisation=${organisationId}`, {
      signal: c.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (!c.signal.aborted) setScope(d);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [organisationId, revision]);
  const engagement = scope?.engagements.find((e) => e.job_id === jobId);
  async function assign(userId: string, remove: boolean) {
    setBusy(true);
    setError("");
    try {
      await sendJson("/api/employers/agency", {
        action: remove ? "unassign" : "assign",
        organisationId,
        details: { jobId, userId },
      });
      setRevision((v) => v + 1);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Assignment could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!scope)
    return (
      <p className="notice" role="status">
        {error || "Loading client and recruiter permissions…"}
      </p>
    );
  if (!scope.members.length)
    return (
      <p className="notice">
        You can edit your assigned vacancy. An agency owner or admin manages its
        client mandate and recruitment lead.
      </p>
    );
  return (
    <fieldset className="agency-role-fields">
      <legend>Agency recruitment</legend>
      <p className="fineprint">
        The agency remains the advertiser and initial application recipient.
        Client work requires a current advertising declaration. The client does
        not need a Westmere account.{" "}
        <Link href="/account?tab=clients">Manage clients →</Link>
      </p>
      <label className="field-label">
        Hiring for
        <select
          name="agencyMode"
          value={hiringMode}
          onChange={(e) => setHiringMode(e.target.value)}
        >
          <option value="internal">Our own agency team</option>
          <option value="client">An authorised client</option>
        </select>
      </label>
      {hiringMode === "client" && (
        <label className="field-label">
          Current client advertising relationship
          <select
            name="authorisationId"
            required
            defaultValue={engagement?.authorisation_id || ""}
          >
            <option value="">Choose a declared client</option>
            {scope.authorisations
              .filter(
                (a) =>
                  ["approved", "declared"].includes(a.status) &&
                  Date.parse(a.valid_from) <= Date.now() &&
                  Date.parse(a.valid_until) > Date.now(),
              )
              .map((a) => (
                <option value={a.id} key={a.id}>
                  {a.client.public_label} · until{" "}
                  {new Date(a.valid_until).toLocaleDateString("en-AU")}
                </option>
              ))}
          </select>
        </label>
      )}
      {hiringMode === "client" && (
        <label className="consent-row">
          <input type="checkbox" name="advertisingConfirmed" required />I
          confirm this is a genuine current vacancy we are authorised to
          advertise, and that any client name or branding is used with
          permission.
        </label>
      )}
      <label className="field-label">
        Recruitment lead account
        <select
          name="leadUserId"
          required
          defaultValue={engagement?.lead_user_id}
        >
          {scope.members
            .filter((m) => ["owner", "admin", "recruiter"].includes(m.role))
            .map((m) => (
              <option value={m.id} key={m.id}>
                {m.email}
              </option>
            ))}
        </select>
      </label>
      <label className="field-label">
        Public recruitment lead name
        <input
          name="recruitmentLead"
          required
          minLength={2}
          maxLength={180}
          defaultValue={leadName}
        />
      </label>
      {jobId && (
        <details>
          <summary>Vacancy assignments</summary>
          <p className="fineprint">
            Owners and admins oversee authorised vacancies. Recruiters must be
            explicitly assigned. Removing the lead pauses an open vacancy.
          </p>
          {scope.members
            .filter((m) => m.role === "recruiter")
            .map((m) => {
              const assigned = scope.assignments.some(
                (a) =>
                  a.job_id === jobId && a.user_id === m.id && !a.revoked_at,
              );
              return (
                <div className="agency-assignment" key={m.id}>
                  <span>{m.email}</span>
                  <button
                    className="button secondary small"
                    type="button"
                    disabled={busy}
                    onClick={() => void assign(m.id, assigned)}
                  >
                    {assigned ? "Remove assignment" : "Assign vacancy"}
                  </button>
                </div>
              );
            })}
        </details>
      )}
      {error && (
        <p role="alert" className="message">
          {error}
        </p>
      )}
    </fieldset>
  );
}
