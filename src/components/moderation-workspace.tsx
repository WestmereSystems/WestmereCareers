"use client";
import { useCallback, useEffect, useState } from "react";
import { CursorControls } from "./page-controls";
import { RichText } from "./rich-text";
import { useSession } from "./providers";
import { sendJson } from "./trust-workflows";
type Item = {
  id: string;
  created_at: string;
  updated_at?: string;
  moderation_updated_at?: string;
  [key: string]: unknown;
};
type Cursor = { at: string; id: string };
const queues = [
  ["verification", "Business verification"],
  ["job", "Listings"],
  ["response_report", "Response reports"],
  ["case", "Concerns & appeals"],
  ["audit", "Decision audit"],
] as const;
const actions: Record<string, string[]> = {
  verification: ["approve", "request_information", "reject"],
  job: ["approve", "reject", "quarantine"],
  response_report: ["accept", "reject", "quarantine"],
  case: ["review", "resolve", "dismiss"],
};
function ModerationWorkspaceForUser() {
  const session = useSession(),
    [kind, setKind] = useState("verification"),
    [all, setAll] = useState(false),
    [items, setItems] = useState<Item[]>([]),
    [cursor, setCursor] = useState<Cursor | null>(null),
    [more, setMore] = useState(false),
    [page, setPage] = useState(0),
    [cursors, setCursors] = useState<(Cursor | undefined)[]>([undefined]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(
    async (after?: Cursor, target = 0, signal?: AbortSignal) => {
      setBusy(true);
      try {
        const p = new URLSearchParams({ kind, all: all ? "1" : "0" });
        if (after) {
          p.set("after", after.at);
          p.set("afterId", after.id);
        }
        const r = await fetch(`/api/admin/trust?${p}`, {
          cache: "no-store",
          signal,
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (signal?.aborted) return;
        setItems(d.items);
        setPage(target);
        setCursors((old) =>
          target ? [...old.slice(0, target), after] : [undefined],
        );
        setMore(d.hasMore);
        setCursor(d.cursor);
      } catch (e) {
        if (!signal?.aborted)
          setMessage(e instanceof Error ? e.message : "Queue unavailable.");
      } finally {
        if (!signal?.aborted) setBusy(false);
      }
    },
    [kind, all],
  );
  useEffect(() => {
    const c = new AbortController();
    setItems([]);
    setMessage("");
    if (session.staffRole) void load(undefined, 0, c.signal);
    return () => c.abort();
  }, [session.staffRole, load]);
  async function decide(e: React.FormEvent<HTMLFormElement>, item: Item) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const d = await sendJson("/api/admin/trust", {
        kind,
        id: item.id,
        action: f.get("action"),
        reason: f.get("reason"),
        version: item.updated_at ?? item.moderation_updated_at ?? null,
        identityChecked: f.get("identity") === "on",
        ownershipChecked: f.get("ownership") === "on",
        ...(kind === "verification"
          ? {
              approvedKind: f.get("approvedKind"),
              sharedAbnChecked: f.get("sharedAbn") === "on",
            }
          : {}),
      });
      setMessage(d.message);
      window.dispatchEvent(new Event("westmere-admin-activity"));
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Decision was not saved.");
    } finally {
      setBusy(false);
    }
  }
  async function suspend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const d = await sendJson("/api/admin/trust", {
        kind: "organisation",
        id: f.get("id"),
        action: String(f.get("action")),
        identityChecked: f.get("identity") === "on",
        ownershipChecked: f.get("ownership") === "on",
        reason: f.get("reason"),
        version: null,
      });
      setMessage(d.message);
      window.dispatchEvent(new Event("westmere-admin-activity"));
      await load();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Business was not suspended.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (session.loading) return <p role="status">Checking reviewer access…</p>;
  if (!session.user)
    return (
      <button className="button primary" onClick={session.openAuth}>
        Sign in as a reviewer
      </button>
    );
  if (!session.staffRole)
    return (
      <div className="panel">
        <h2>Independent reviewer access required.</h2>
        <p>
          Review permissions are assigned privately by the site owner. Account
          metadata and business memberships cannot grant this access.
        </p>
      </div>
    );
  return (
    <>
      <div
        className="actions-row queue-tabs"
        role="group"
        aria-label="Review queues"
      >
        {queues.map(([v, label]) => (
          <button
            className={`button ${kind === v ? "primary" : "secondary"}`}
            key={v}
            onClick={() => setKind(v)}
            aria-pressed={kind === v}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="notice">
        Check independent business identity and hiring authority before
        approval. Review listing accuracy, pay context, application requirements
        and concerns. For reports, check dates, provenance, conflicts and
        duplicate experiences. Receipts and opens do not count as meaningful
        responses. Record a factual reason; verification and case feedback is
        shared with its requester, and listing feedback with the employer.
        Self-review is blocked.
      </p>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={all}
          onChange={(e) => setAll(e.target.checked)}
        />
        Include completed items
      </label>
      <button className="text-link" onClick={() => void load()}>
        Refresh queue
      </button>
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
      <section aria-busy={busy}>
        {!busy && !items.length && (
          <p className="panel">This queue is clear.</p>
        )}
        {items.map((item) => (
          <details
            className="panel review-item"
            key={`${kind}-${page}-${item.id}`}
          >
            <summary>
              {String(
                item.business_name ??
                  item.title ??
                  item.company ??
                  item.kind ??
                  item.action ??
                  "Review item",
              )}
            </summary>
            {kind === "verification" && (
              <p className="notice">
                Review target:{" "}
                {new Date(
                  Date.parse(item.created_at) + 48 * 3600000,
                ).toLocaleString("en-AU", {
                  timeZone: "Australia/Melbourne",
                })}{" "}
                Melbourne time · complete submissions. Check the public contact
                source and applicant’s permission before contacting the
                business.
              </p>
            )}
            <dl className="review-facts">
              {Object.entries(item)
                .filter(
                  ([k, v]) =>
                    ![
                      "id",
                      "search_vector",
                      "cv_text_snapshot",
                      "listing_documents",
                    ].includes(k) &&
                    v !== null &&
                    v !== "" &&
                    v !== undefined,
                )
                .map(([k, v]) => (
                  <div key={k}>
                    <dt>{k.replaceAll("_", " ")}</dt>
                    <dd>
                      {typeof v === "object" ? JSON.stringify(v) : String(v)}
                    </dd>
                  </div>
                ))}
            </dl>
            {kind === "job" && (
              <>
                <h3>Candidate-facing description</h3>
                <RichText text={String(item.description || "")} />
                {Array.isArray(item.listing_documents) &&
                  item.listing_documents.length > 0 && (
                    <section>
                      <h3>Supporting documents to review</h3>
                      <ul>
                        {(
                          item.listing_documents as {
                            id: string;
                            filename: string;
                          }[]
                        ).map((d) => (
                          <li key={d.id}>
                            <a href={`/api/listing-documents?id=${d.id}`}>
                              {d.filename}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
              </>
            )}
            {kind === "verification" && item.status === "withdrawn" && (
              <p className="notice">
                The applicant withdrew this verification request. It is retained
                as history and cannot be approved.
              </p>
            )}
            {kind !== "audit" &&
              !(kind === "verification" && item.status === "withdrawn") && (
                <form
                  className="form-stack"
                  onSubmit={(e) => void decide(e, item)}
                >
                  <label className="field-label">
                    Decision
                    <select name="action">
                      {actions[kind].map((a) => (
                        <option key={a} value={a}>
                          {a.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  {kind === "verification" && (
                    <>
                      <label className="field-label">
                        Approve business as
                        <select
                          name="approvedKind"
                          defaultValue={String(
                            item.requested_kind || "employer",
                          )}
                        >
                          <option value="employer">Employer</option>
                          <option value="agency">Recruitment agency</option>
                        </select>
                        <span className="fineprint">
                          The reviewed type determines Billing plans. Existing
                          paid accounts require the account-type correction
                          workflow.
                        </span>
                      </label>
                      {Boolean(item.shared_abn) && (
                        <label className="checkbox-label">
                          <input name="sharedAbn" type="checkbox" />I checked
                          that this is a separate authorised trading brand
                          sharing an existing ABN. This approval grants no
                          access to the other business.
                        </label>
                      )}
                      <label className="checkbox-label">
                        <input name="identity" type="checkbox" />I independently
                        checked the registered business identity and ABN
                      </label>
                      <label className="checkbox-label">
                        <input name="ownership" type="checkbox" />I
                        independently confirmed this applicant’s authority to
                        hire
                      </label>
                    </>
                  )}
                  <label className="field-label">
                    Reason and evidence summary
                    <textarea
                      name="reason"
                      minLength={10}
                      maxLength={2000}
                      required
                    />
                  </label>
                  <button className="button primary" disabled={busy}>
                    Record decision
                  </button>
                </form>
              )}
          </details>
        ))}
      </section>
      <CursorControls
        page={page}
        more={more}
        busy={busy}
        label="Review queue pages"
        onPrevious={() => void load(cursors[page - 1], page - 1)}
        onNext={() => cursor && void load(cursor, page + 1)}
      />
      {session.staffRole === "admin" && (
        <details className="panel">
          <summary>Suspend or reinstate a business after investigation</summary>
          <p>
            Suspension closes its roles and blocks hiring access to candidate
            documents. Record the investigation and notify the business through
            its review case.
          </p>
          <form className="form-stack" onSubmit={suspend}>
            <label className="field-label">
              Action
              <select name="action">
                <option value="suspend">
                  Suspend hiring access and close roles
                </option>
                <option value="reinstate">
                  Reinstate verified hiring access; keep roles closed
                </option>
              </select>
            </label>
            <label className="checkbox-label">
              <input type="checkbox" name="identity" />I repeated the
              independent business identity check (required for reinstatement)
            </label>
            <label className="checkbox-label">
              <input type="checkbox" name="ownership" />I repeated the
              hiring-authority check (required for reinstatement)
            </label>
            <label className="field-label">
              Organisation ID
              <input name="id" required pattern="[0-9a-fA-F-]{36}" />
            </label>
            <label className="field-label">
              Investigation and reason
              <textarea
                name="reason"
                minLength={10}
                maxLength={2000}
                required
              />
            </label>
            <button className="button secondary" disabled={busy}>
              Record business access decision
            </button>
          </form>
        </details>
      )}
    </>
  );
}

export function ModerationWorkspace() {
  const session = useSession();
  return <ModerationWorkspaceForUser key={session.user?.id ?? "signed-out"} />;
}
