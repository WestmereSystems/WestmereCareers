"use client";
import { useEffect, useState } from "react";
import { useSession } from "./providers";
import { sendJson } from "./trust-workflows";
import { DashboardSkeleton } from "./skeleton";

type Authority = {
  id: string;
  client_id: string;
  status: string;
  evidence: string;
  feedback: string;
  updated_at: string;
  valid_from: string;
  valid_until: string;
  can_offer: boolean;
  client_approved_at: string | null;
  agencyName?: string;
  client?: Client;
};
type Client = {
  id: string;
  name: string;
  public_label: string;
  disclosed: boolean;
  representative_name: string;
  representative_email: string;
  employer_id: string | null;
};
type Workspace = {
  quota?: Record<string, string | number>;
  pilotEnabled?: boolean;
  clients?: Client[];
  authorisations?: Authority[];
  delegations?: Authority[];
  members?: { id: string; email: string; role: string }[];
  assignments?: {
    job_id: string;
    user_id: string;
    revoked_at: string | null;
  }[];
};
export function AgencyWorkspace({ review = false }: { review?: boolean }) {
  const session = useSession();
  const organisations = (session.business?.organisations || []).filter(
    (o) => o.verified && (o.kind === "agency" || o.role === "owner"),
  );
  const [organisation, setOrganisation] = useState(organisations[0]?.id || "");
  const [data, setData] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const org = organisations.find((o) => o.id === organisation);
  const admin = org && ["owner", "admin"].includes(org.role);
  const employerView = !review && org?.kind === "employer";
  const agencyView = !review && org?.kind === "agency";
  const hasAuthorities = Boolean(
    data?.authorisations?.length || data?.delegations?.length,
  );
  useEffect(() => {
    const c = new AbortController();
    setData(null);
    setError("");
    if (!review && !organisation) return;
    fetch(
      `/api/employers/agency?${review ? "review=1" : `organisation=${organisation}`}`,
      { cache: "no-store", signal: c.signal },
    )
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (!c.signal.aborted) setData(d);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [organisation, review, version]);
  async function action(
    action: string,
    id: string | null,
    details: Record<string, unknown>,
  ) {
    setBusy(true);
    setError("");
    try {
      await sendJson("/api/employers/agency", {
        action,
        id,
        organisationId: organisation || null,
        details,
      });
      setVersion((v) => v + 1);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The change could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel agency-workspace">
      <p className="eyebrow">
        {review
          ? "Independent agency review"
          : employerView
            ? "Your recruitment permissions"
            : "Recruitment relationships"}
      </p>
      <h2>
        {review
          ? "Client authority review."
          : employerView
            ? "Agency authorisations."
            : "Clients and authorisations."}
      </h2>
      <p className="muted">
        {review
          ? "Review client identity and the agency’s recruitment mandate independently. Permission to communicate offers requires an explicit grant."
          : employerView
            ? "Review requests for an agency to recruit on behalf of your business. You can confirm a request or revoke an existing authorisation. Each client mandate is reviewed separately from the agency’s business verification."
            : "Manage your agency’s clients and request recruitment authority for each client. Each mandate needs independent review before client vacancies can be published. Applications first go to the named recruiting agency, and recruiters only access their assigned vacancies."}
      </p>
      {!review && (
        <div className="form-stack">
          <label className="field-label">
            Business workspace
            <select
              value={organisation}
              onChange={(e) => setOrganisation(e.target.value)}
              aria-describedby="agency-workspace-help"
            >
              {organisations
                .filter((o) => o.verified)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
            </select>
          </label>
          <p id="agency-workspace-help" className="fineprint">
            {employerView
              ? "Choose the employer business whose agency authorisations you want to review."
              : "Choose your agency workspace. Client businesses are managed separately below."}
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="message">
          {error}
        </p>
      )}
      {!data && !error && <DashboardSkeleton />}
      {data?.quota && (
        <>
          <p className="notice">
            {data.pilotEnabled
              ? "Agency publication pilot enabled"
              : "Agency publication awaits independent pilot approval"}
          </p>
          <div className="form-grid">
            {[
              ["Vacancies", "usedVacancies", "vacancies"],
              ["Clients", "usedClients", "clients"],
              ["Recruiter seats", "usedSeats", "seats"],
            ].map(([label, used, total]) => (
              <div className="panel" key={label}>
                <strong>{label}</strong>
                <p>
                  {data.quota?.[used]} / {data.quota?.[total]}
                </p>
              </div>
            ))}
          </div>
          <p className="fineprint">
            Capacity is shared by the businesses covered by this subscription.
            The owner counts as a seat; pending invitations reserve seats.
            Owned-business coverage is separate from client capacity.
          </p>
        </>
      )}
      {data && !error && !hasAuthorities && (
        <div className="notice" role="status">
          <strong>
            {review
              ? "No client authority reviews waiting."
              : employerView
                ? "No agency authorisations yet."
                : data.clients?.length
                  ? "No client authorisations yet."
                  : "No clients or authorisations to show yet."}
          </strong>
          <p>
            {review ? (
              "There are no client authorisations awaiting independent review."
            ) : employerView ? (
              <>
                No agency has submitted a recruitment authorisation request
                linked to {org.name}. Requests will appear here when an agency
                links this business as a client and submits its mandate for
                review.
              </>
            ) : agencyView && admin ? (
              data.clients?.length ? (
                "Your client records are listed below. Open Request client authority for a client to submit its recruitment mandate for independent review."
              ) : (
                "Add a private client below, then request authority to recruit on their behalf. Adding a client does not itself approve a recruitment mandate."
              )
            ) : (
              "No recruitment authorisations are available for your assigned vacancies. An agency owner or administrator can arrange client authority and assign you to the relevant vacancies."
            )}
          </p>
        </div>
      )}
      {!review && org?.kind === "agency" && admin && (
        <details>
          <summary>Add a private client</summary>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void action("client_create", null, {
                name: f.get("name"),
                publicLabel: f.get("publicLabel") || "Confidential client",
                disclosed: f.get("disclosed") === "on",
                representativeName: f.get("representativeName"),
                representativeEmail: f.get("representativeEmail"),
                employerId: f.get("employerId") || null,
              });
            }}
          >
            <label className="field-label">
              Private client name
              <input name="name" required minLength={2} maxLength={180} />
            </label>
            <label className="field-label">
              Verified employer ID (optional)
              <input
                name="employerId"
                placeholder="Link an existing employer, or leave blank for independent representative review"
              />
            </label>
            <label className="field-label">
              Client representative
              <input
                name="representativeName"
                required
                minLength={2}
                maxLength={180}
              />
            </label>
            <label className="field-label">
              Representative email
              <input
                name="representativeEmail"
                type="email"
                required
                maxLength={254}
              />
            </label>
            <label className="consent-row">
              <input type="checkbox" name="disclosed" />
              Disclose a public client label
            </label>
            <label className="field-label">
              Public client label
              <input name="publicLabel" minLength={2} maxLength={180} />
            </label>
            <button className="button primary" disabled={busy}>
              Add client
            </button>
          </form>
        </details>
      )}
      {data?.clients?.map((client) => (
        <article key={client.id} className="panel agency-client">
          <h3>{client.name}</h3>
          <p className="muted">
            Public label: {client.public_label} ·{" "}
            {client.disclosed ? "Disclosed" : "Confidential"}
          </p>
          {admin && (
            <details>
              <summary>Request client authority</summary>
              <form
                className="form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void action("request_authorisation", client.id, {
                    evidence: f.get("evidence"),
                    validFrom: new Date(String(f.get("from"))).toISOString(),
                    validUntil: new Date(String(f.get("until"))).toISOString(),
                    canOffer: f.get("offers") === "on",
                    canCommunicateDecisions: true,
                  });
                }}
              >
                <label className="field-label">
                  Authority evidence
                  <textarea
                    name="evidence"
                    required
                    minLength={30}
                    maxLength={6000}
                    placeholder="Explain the mandate, who authorised it, how the reviewer can verify it and which vacancies it covers."
                  />
                </label>
                <div className="form-grid">
                  <label className="field-label">
                    Valid from
                    <input name="from" type="date" required />
                  </label>
                  <label className="field-label">
                    Valid until
                    <input name="until" type="date" required />
                  </label>
                </div>
                <label className="consent-row">
                  <input type="checkbox" name="offers" />
                  Request explicit authority to communicate offers
                </label>
                <button className="button secondary" disabled={busy}>
                  Submit for independent review
                </button>
              </form>
            </details>
          )}
        </article>
      ))}
      {[...(data?.authorisations || []), ...(data?.delegations || [])].map(
        (a) => (
          <article key={a.id} className="panel agency-client">
            <h3>
              {a.client?.name ||
                data?.clients?.find((c) => c.id === a.client_id)?.name ||
                "Client authority"}
              {a.agencyName ? ` · ${a.agencyName}` : ""}
            </h3>
            <p>
              <strong>{a.status.replaceAll("_", " ")}</strong> ·{" "}
              {new Date(a.valid_from).toLocaleDateString("en-AU")} to{" "}
              {new Date(a.valid_until).toLocaleDateString("en-AU")}
            </p>
            <p style={{ whiteSpace: "pre-wrap" }}>{a.evidence}</p>
            {a.feedback && (
              <p className="notice">Reviewer feedback: {a.feedback}</p>
            )}
            {review && (
              <form
                className="form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void action("review", a.id, {
                    decision: f.get("decision"),
                    version: a.updated_at,
                    reason: f.get("reason"),
                    identityChecked: f.get("identity") === "on",
                    authorityChecked: f.get("authority") === "on",
                    offerAuthorityChecked: f.get("offer") === "on",
                  });
                }}
              >
                <p className="fineprint">
                  Representative: {a.client?.representative_name} ·{" "}
                  {a.client?.representative_email}. Linked employer approval:{" "}
                  {a.client_approved_at ? "Recorded" : "Not recorded"}.
                </p>
                <label className="consent-row">
                  <input type="checkbox" name="identity" />
                  Independently checked client identity
                </label>
                <label className="consent-row">
                  <input type="checkbox" name="authority" />
                  Independently verified representative and recruitment mandate
                </label>
                <label className="consent-row">
                  <input type="checkbox" name="offer" />
                  Verified explicit offer authority
                </label>
                <label className="field-label">
                  Decision
                  <select name="decision">
                    <option value="request_information">
                      Request information
                    </option>
                    <option value="approve">Approve</option>
                    <option value="reject">Reject</option>
                  </select>
                </label>
                <label className="field-label">
                  Review feedback
                  <textarea
                    name="reason"
                    required
                    minLength={10}
                    maxLength={2000}
                  />
                </label>
                <button className="button primary" disabled={busy}>
                  Record review
                </button>
              </form>
            )}
            {!review &&
              data?.delegations &&
              ["pending", "needs_information"].includes(a.status) && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void action("client_approve", a.id, {
                      canOffer: f.get("offer") === "on",
                      reason: "Client owner confirmed the recruitment mandate.",
                    });
                  }}
                >
                  <label className="consent-row">
                    <input type="checkbox" required />I authorise this agency
                    for the described recruitment mandate
                  </label>
                  <label className="consent-row">
                    <input type="checkbox" name="offer" />I explicitly grant
                    offer communication authority
                  </label>
                  <button className="button primary" disabled={busy}>
                    Confirm client authority
                  </button>
                </form>
              )}
            {!review &&
              (admin || data?.delegations) &&
              a.status !== "revoked" && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void action("revoke", a.id, { reason: f.get("reason") });
                  }}
                >
                  <label className="field-label">
                    Revocation reason
                    <input
                      name="reason"
                      required
                      minLength={10}
                      maxLength={2000}
                    />
                  </label>
                  <button className="button secondary" disabled={busy}>
                    Revoke authority
                  </button>
                </form>
              )}
          </article>
        ),
      )}
      {review && (
        <details>
          <summary>Agency publication pilot</summary>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const id = String(f.get("organisation"));
              setBusy(true);
              sendJson("/api/employers/agency", {
                action: "pilot",
                organisationId: id,
                details: {
                  enabled: f.get("enabled") === "on",
                  reason: f.get("reason"),
                },
              })
                .then(() => setVersion((v) => v + 1))
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          >
            <label className="field-label">
              Verified agency ID
              <input name="organisation" required />
            </label>
            <label className="consent-row">
              <input name="enabled" type="checkbox" />
              Enable invite-only publication after the release checks pass
            </label>
            <label className="field-label">
              Pilot review reason
              <textarea
                name="reason"
                required
                minLength={10}
                maxLength={2000}
              />
            </label>
            <button className="button secondary" disabled={busy}>
              Save pilot status
            </button>
          </form>
        </details>
      )}
    </section>
  );
}
