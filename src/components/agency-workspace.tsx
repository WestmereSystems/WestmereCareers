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
  declared_at: string | null;
  declaration_version: string | null;
  offer_requested: boolean;
  canReview?: boolean;
  events?: RelationshipEvent[];
  agencyName?: string;
  client?: Client;
};
type RelationshipEvent = {
  authorisation_id?: string;
  action: string;
  reason: string;
  created_at: string;
};
type Client = {
  id: string;
  name: string;
  public_label: string;
  disclosed: boolean;
  representative_name: string;
  representative_email: string;
  employer_id: string | null;
  blocked_at?: string | null;
  block_reason?: string | null;
};
type Workspace = {
  total?: number;
  events?: RelationshipEvent[];
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
  const [offset, setOffset] = useState(0);
  const [message, setMessage] = useState("");
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
      `/api/employers/agency?${review ? `review=1&offset=${offset}` : `organisation=${organisation}`}`,
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
  }, [organisation, review, version, offset]);
  async function action(
    action: string,
    id: string | null,
    details: Record<string, unknown>,
  ) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await sendJson("/api/employers/agency", {
        action,
        id,
        organisationId: organisation || null,
        details,
      });
      setVersion((v) => v + 1);
      setMessage("Relationship updated.");
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
          ? "Agency relationships and audits"
          : employerView
            ? "Your agency relationships"
            : "Recruitment relationships"}
      </p>
      <h2>
        {review
          ? "Agency client register."
          : employerView
            ? "Agency relationships."
            : "Clients and declarations."}
      </h2>
      <p className="muted">
        {review
          ? "Audit declared relationships and investigate disputes. Ordinary advertising needs no routine approval. Request evidence and pause a relationship when necessary. Offer communication still requires independently verified authority."
          : employerView
            ? "Agencies declare their authority under an external agreement. Ordinary advertising does not require your confirmation. You can optionally confirm a relationship or dispute unauthorised advertising. Confirmation grants no access to your account or applicant records."
            : "Record each client and declare your current advertising authority. Keep the agreement evidence available for audits; routine employer or Admin approval is not required. Applications first go to the named agency. This does not allow applying for jobs on anyone’s behalf."}
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
              ? "Choose the employer business whose agency relationships you want to manage."
              : "Choose your agency workspace. Client businesses are managed separately below."}
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="message">
          {error}
        </p>
      )}
      {message && (
        <p className="notice" role="status">
          {message}
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
              ? "No agency relationships recorded."
              : employerView
                ? "No agency relationships yet."
                : data.clients?.length
                  ? "No client declarations yet."
                  : "No clients or declarations to show yet."}
          </strong>
          <p>
            {review ? (
              "Declared relationships and evidence requests will appear in this register."
            ) : employerView ? (
              <>
                No agency has declared a relationship linked to {org.name}.
                Linked declarations will appear here for optional confirmation
                or dispute. An agency does not need you to register or approve
                routine advertising.
              </>
            ) : agencyView && admin ? (
              data.clients?.length ? (
                "Your client records are listed below. Open Declare advertising authority to record the current agreement and permitted recruitment scope."
              ) : (
                "Add a private client, then accept the advertising declaration. Keep supporting agreement evidence for requests and audits."
              )
            ) : (
              "No client declarations are available for your assigned vacancies. An agency owner or administrator can declare a client relationship and assign vacancies."
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
                brandingConfirmed: f.get("branding") === "on",
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
                placeholder="Optional: link an existing employer so its owner can confirm or dispute the relationship"
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
              Disclose a public client label (otherwise confidential)
            </label>
            <label className="field-label">
              Public client label
              <input name="publicLabel" minLength={2} maxLength={180} />
            </label>
            <label className="consent-row">
              <input type="checkbox" name="branding" />I have permission to
              disclose this client name and use any client branding. Required
              when disclosing a public label.
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
              <summary>Declare advertising authority</summary>
              <form
                className="form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void action("declare_client", client.id, {
                    advertisingConfirmed: f.get("declaration") === "on",
                    declarationVersion: "agency-advertising-v1",
                    brandingConfirmed: f.get("branding") === "on",
                    evidence: f.get("evidence"),
                    validFrom: new Date(String(f.get("from"))).toISOString(),
                    validUntil: new Date(String(f.get("until"))).toISOString(),
                    canOffer: f.get("offers") === "on",
                    canCommunicateDecisions: true,
                  });
                }}
              >
                <label className="field-label">
                  Recruitment scope and agreement reference
                  <textarea
                    name="evidence"
                    required
                    minLength={30}
                    maxLength={6000}
                    placeholder="Describe the agreed recruitment scope, who authorised it and the agreement reference. Keep the contract privately; provide supporting evidence if requested."
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
                  Request separately reviewed permission to communicate offers
                </label>
                <label className="consent-row">
                  <input type="checkbox" name="declaration" required />I confirm
                  our agency holds current client authority to advertise genuine
                  vacancies within this scope, will retain evidence and provide
                  it on request, and will stop when authority ends. This grants
                  no permission to apply for jobs on anyone’s behalf or access
                  the client’s Westmere account.
                </label>
                {client.disclosed && (
                  <label className="consent-row">
                    <input type="checkbox" name="branding" required />I confirm
                    permission to publish the client name or branding.
                  </label>
                )}
                <p className="fineprint">
                  Declaration agency-advertising-v1. Choose an end date within
                  one year. Additional offer permissions require separate
                  review. Publication remains subject to agency verification,
                  plan capacity, vacancy moderation and launch restrictions.
                </p>
                <button className="button secondary" disabled={busy}>
                  Record advertising declaration
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
                "Client relationship"}
              {a.agencyName ? ` · ${a.agencyName}` : ""}
            </h3>
            <p>
              <strong>
                {a.status === "declared"
                  ? "Agency declared — no employer verification implied"
                  : a.status === "approved"
                    ? "Independently reviewed"
                    : a.status.replaceAll("_", " ")}
              </strong>{" "}
              · {new Date(a.valid_from).toLocaleDateString("en-AU")} to{" "}
              {new Date(a.valid_until).toLocaleDateString("en-AU")}
            </p>
            <p style={{ whiteSpace: "pre-wrap" }}>{a.evidence}</p>
            <p className="fineprint">
              Employer confirmation:{" "}
              {a.client_approved_at ? "Recorded" : "Optional — not recorded"}.
              Offer communication:{" "}
              {a.can_offer
                ? "Separately approved"
                : a.offer_requested
                  ? "Requested — independent review required"
                  : "Not granted"}
              .
              {a.declared_at
                ? ` Declaration recorded ${new Date(a.declared_at).toLocaleString("en-AU")} (${a.declaration_version}).`
                : ""}
            </p>
            {a.client?.blocked_at && (
              <p className="notice">
                Relationship paused: {a.client.block_reason}
              </p>
            )}
            {a.feedback && (
              <p className="notice">Audit or dispute feedback: {a.feedback}</p>
            )}
            {review && a.canReview !== false && (
              <form
                className="form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void action(
                    f.get("decision") === "clear_block"
                      ? "clear_block"
                      : f.get("decision") === "revoke"
                        ? "revoke"
                        : "review",
                    a.id,
                    {
                      decision: f.get("decision"),
                      version: a.updated_at,
                      reason: f.get("reason"),
                      identityChecked: f.get("identity") === "on",
                      authorityChecked: f.get("authority") === "on",
                      offerAuthorityChecked: f.get("offer") === "on",
                    },
                  );
                }}
              >
                <p className="fineprint">
                  Representative: {a.client?.representative_name} ·{" "}
                  {a.client?.representative_email}. Optional employer
                  confirmation:{" "}
                  {a.client_approved_at ? "Recorded" : "Not recorded"}.
                </p>
                <label className="consent-row">
                  <input type="checkbox" name="identity" />
                  Independently checked client identity (required to clear an
                  audit)
                </label>
                <label className="consent-row">
                  <input type="checkbox" name="authority" />
                  Independently verified representative and agreement evidence
                </label>
                <label className="consent-row">
                  <input type="checkbox" name="offer" />
                  Verified separate explicit permission to communicate offers
                </label>
                <label className="field-label">
                  Decision
                  <select name="decision">
                    {["revoked", "rejected"].includes(a.status) && (
                      <option value="clear_block">
                        Clear resolved hold for a future declaration
                      </option>
                    )}
                    <option value="request_information">
                      Request evidence and pause advertising
                    </option>
                    <option value="approve">
                      Complete audit / restore advertising
                    </option>
                    <option value="reject">Reject relationship</option>
                    <option value="revoke">Revoke relationship</option>
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
              ["pending", "needs_information", "declared", "approved"].includes(
                a.status,
              ) && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void action("client_approve", a.id, {
                      version: a.updated_at,
                      canOffer: f.get("offer") === "on",
                      reason: "Client owner confirmed the recruitment mandate.",
                    });
                  }}
                >
                  <label className="consent-row">
                    <input type="checkbox" required />I confirm this agency’s
                    existing authority for the described recruitment activities
                  </label>
                  <label className="consent-row">
                    <input type="checkbox" name="offer" />I explicitly grant
                    permission to communicate offers (independent review
                    required)
                  </label>
                  <button className="button primary" disabled={busy}>
                    Confirm relationship (optional)
                  </button>
                </form>
              )}
            {!review &&
              agencyView &&
              admin &&
              !a.can_offer &&
              !a.offer_requested &&
              ["declared", "approved"].includes(a.status) && (
                <button
                  className="button secondary small"
                  disabled={busy}
                  onClick={() => void action("request_offer", a.id, {})}
                >
                  Request separate offer permission review
                </button>
              )}
            {review && a.canReview === false && (
              <p className="notice">
                Another independent reviewer must handle this relationship.
              </p>
            )}
            {!review &&
              agencyView &&
              admin &&
              a.status === "needs_information" && (
                <form
                  className="form-stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void action("submit_evidence", a.id, {
                      reason: f.get("reason"),
                    });
                  }}
                >
                  <label className="field-label">
                    Agreement evidence or verification details
                    <textarea
                      name="reason"
                      minLength={30}
                      maxLength={2000}
                      required
                    />
                  </label>
                  <button className="button secondary" disabled={busy}>
                    Submit evidence to Admin
                  </button>
                  <p className="fineprint">
                    Advertising remains paused until the audit is resolved. Do
                    not include candidate information.
                  </p>
                </form>
              )}
            {!review &&
              employerView &&
              !["revoked", "rejected"].includes(a.status) && (
                <form
                  className="form-stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void action("dispute", a.id, {
                      version: a.updated_at,
                      reason: f.get("reason"),
                    });
                  }}
                >
                  <label className="field-label">
                    Report unauthorised advertising
                    <textarea
                      name="reason"
                      minLength={10}
                      maxLength={2000}
                      required
                    />
                  </label>
                  <button className="button secondary" disabled={busy}>
                    Dispute and pause relationship
                  </button>
                  <p className="fineprint">
                    This pauses associated advertising and alerts Admin through
                    its client register. Employers without an account can report
                    a listing or contact hello@westmere.com.au.
                  </p>
                </form>
              )}
            {(
              a.events ||
              data?.events?.filter((ev) => ev.authorisation_id === a.id)
            )?.length ? (
              <details>
                <summary>Relationship history</summary>
                {(
                  a.events ||
                  data?.events?.filter((ev) => ev.authorisation_id === a.id)
                )?.map((ev, index) => (
                  <p key={`${ev.created_at}-${index}`}>
                    <strong>{ev.action.replaceAll("_", " ")}</strong> ·{" "}
                    {new Date(ev.created_at).toLocaleString("en-AU")}
                    <br />
                    {ev.reason}
                  </p>
                ))}
              </details>
            ) : null}
            {!review && agencyView && admin && a.status !== "revoked" && (
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
                  Withdraw declaration
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
      {review && (data?.total || 0) > 50 && (
        <nav aria-label="Agency register pages">
          <button
            className="button secondary small"
            disabled={busy || offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 50))}
          >
            Previous
          </button>
          <span>
            {" "}
            {offset + 1}–{Math.min(offset + 50, data?.total || 0)} of{" "}
            {data?.total}{" "}
          </span>
          <button
            className="button secondary small"
            disabled={busy || offset + 50 >= (data?.total || 0)}
            onClick={() => setOffset(offset + 50)}
          >
            Next
          </button>
        </nav>
      )}
    </section>
  );
}
