"use client";
import { useEffect, useState } from "react";
import { useSession } from "./providers";
import { sendJson } from "./trust-workflows";
import { sandboxPlans } from "@/lib/billing-plans";
type Correction = {
  id: string;
  organisation_id: string;
  requested_kind: string;
  previous_kind: string;
  status: string;
  evidence: string;
  feedback: string;
  updated_at: string;
  accepted_at: string | null;
  billing_quote?: Quote;
  quote_hash?: string;
  specialisms: string[];
  regions: string[];
};
type Quote = {
  planName: string;
  monthlyAmount: number;
  amountDue: number;
  total: number;
  effectiveAt: string;
};
const money = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(
    n / 100,
  );
export function BusinessTypeChanges({ review = false }: { review?: boolean }) {
  const session = useSession();
  const [rows, setRows] = useState<Correction[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [quotes, setQuotes] = useState<
      Record<string, { quote: Quote; quoteHash: string }>
    >({});
  useEffect(() => {
    const c = new AbortController();
    fetch(
      review ? "/api/employers/agency?review=1" : "/api/employers/account-type",
      { cache: "no-store", signal: c.signal },
    )
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (!c.signal.aborted)
          setRows(d[review ? "corrections" : "requests"] || []);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [review, revision]);
  async function action(
    action: string,
    id: string | null,
    details: Record<string, unknown>,
  ) {
    setBusy(true);
    setError("");
    try {
      const d = await sendJson("/api/employers/account-type", {
        action,
        id,
        details,
      });
      if (d.quote) setQuotes((q) => ({ ...q, [id!]: d }));
      else {
        setRevision((v) => v + 1);
        await session.refresh();
      }
      if (d.paymentUrl) window.location.assign(d.paymentUrl);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The request could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel agency-workspace">
      <h3>
        {review ? "Account-type correction review" : "Change account type"}
      </h3>
      <p className="muted">
        Correct an employer or agency registration while preserving this account
        and its history. Approved businesses need an independent review.
        Subscription changes require the billing owner’s acceptance.
      </p>
      {error && (
        <p role="alert" className="message">
          {error}
        </p>
      )}
      {!review && (
        <details>
          <summary>Request a correction</summary>
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void action("request", String(f.get("organisation")) || null, {
                kind: f.get("kind"),
                evidence: f.get("evidence"),
                specialisms: String(f.get("specialisms") || "")
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean),
                regions: String(f.get("regions") || "")
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean),
              });
            }}
          >
            <label className="field-label">
              Owned business
              <select name="organisation">
                <option value="">Unverified onboarding only</option>
                {session.business?.organisations
                  .filter((o) => o.role === "owner")
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} · {o.kind || "employer"}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field-label">
              Correct business type
              <select name="kind">
                <option value="agency">Recruitment agency</option>
                <option value="employer">Employer</option>
              </select>
            </label>
            <label className="field-label">
              Evidence and reason
              <textarea
                name="evidence"
                required
                minLength={30}
                maxLength={6000}
              />
            </label>
            <label className="field-label">
              Agency specialisms (comma separated)
              <input name="specialisms" maxLength={1000} />
            </label>
            <label className="field-label">
              Agency regions (comma separated)
              <input name="regions" maxLength={1000} />
            </label>
            <button className="button secondary" disabled={busy}>
              Submit correction
            </button>
          </form>
        </details>
      )}
      {rows.map((r) => (
        <article className="panel agency-client" key={r.id}>
          <h4>
            {r.previous_kind} → {r.requested_kind}
          </h4>
          <p>
            <strong>{r.status.replaceAll("_", " ")}</strong>
          </p>
          <p style={{ whiteSpace: "pre-wrap" }}>{r.evidence}</p>
          {r.feedback && <p className="notice">{r.feedback}</p>}
          {review && (
            <>
              <p className="fineprint">
                Specialisms: {r.specialisms.join(", ")} · Regions:{" "}
                {r.regions.join(", ")}
              </p>
              <form
                className="form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void action("review", r.id, {
                    decision: f.get("decision"),
                    version: r.updated_at,
                    reason: f.get("reason"),
                    identityChecked: f.get("identity") === "on",
                    authorityChecked: f.get("authority") === "on",
                  });
                }}
              >
                <label className="consent-row">
                  <input type="checkbox" name="identity" />
                  Independently checked the corrected identity
                </label>
                <label className="consent-row">
                  <input type="checkbox" name="authority" />
                  Independently checked authority, specialisms and regions
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
                  Feedback
                  <textarea
                    name="reason"
                    required
                    minLength={10}
                    maxLength={2000}
                  />
                </label>
                <button className="button primary" disabled={busy}>
                  Record correction review
                </button>
              </form>
            </>
          )}
          {!review && r.status === "awaiting_billing" && !r.accepted_at && (
            <>
              <form
                className="form-stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void action("quote", r.id, { plan: f.get("plan") });
                }}
              >
                <label className="field-label">
                  Proposed package
                  <select name="plan">
                    {sandboxPlans
                      .filter((p) => p.audience === r.requested_kind)
                      .map((p) => (
                        <option value={p.code} key={p.code}>
                          {p.name} · {money(p.amount)}/month
                        </option>
                      ))}
                  </select>
                </label>
                <button className="button secondary" disabled={busy}>
                  Preview billing change
                </button>
              </form>
              {quotes[r.id] && (
                <form
                  className="form-stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action("accept", r.id, {
                      quoteHash: quotes[r.id].quoteHash,
                    });
                  }}
                >
                  <p className="notice">
                    {quotes[r.id].quote.planName}:{" "}
                    {money(quotes[r.id].quote.monthlyAmount)} per month. Amount
                    due on change: {money(quotes[r.id].quote.amountDue)}.
                    Invoice total including any credit:{" "}
                    {money(quotes[r.id].quote.total)}. Effective{" "}
                    {new Date(quotes[r.id].quote.effectiveAt).toLocaleString(
                      "en-AU",
                    )}
                    . Preview expires after 15 minutes. Existing customer and
                    subscription are retained.
                  </p>
                  <label className="consent-row">
                    <input type="checkbox" required />I accept these billing
                    terms and the reviewed change of business type
                  </label>
                  <button className="button primary" disabled={busy}>
                    Accept subscription change
                  </button>
                </form>
              )}
            </>
          )}
          {!review && r.status === "awaiting_billing" && r.accepted_at && (
            <p className="notice">
              Accepted billing transition awaiting confirmation. Refresh this
              page after payment; permissions remain based on the approved
              current type until reconciliation completes.
            </p>
          )}
          {!review &&
            ["pending", "needs_information", "awaiting_billing"].includes(
              r.status,
            ) &&
            !r.accepted_at && (
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => void action("cancel", r.id, {})}
              >
                Cancel correction request
              </button>
            )}
        </article>
      ))}
    </section>
  );
}
