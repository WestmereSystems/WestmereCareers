"use client";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "./providers";
import { sendJson } from "./trust-workflows";
import { privacyStatus, type PrivacyRequest } from "./account-privacy";
import { PageControls } from "./page-controls";
type Request = PrivacyRequest & {
  email: string;
  account_kind: string;
  user_id: string | null;
};
export function AccountPrivacyAdministration() {
  const session = useSession();
  return session.staffRole === "admin" ? <PrivacyQueue /> : null;
}
function PrivacyQueue() {
  const [data, setData] = useState<{
      requests: Request[];
      total: number;
      open: number;
      overdue: number;
    } | null>(null),
    [page, setPage] = useState(1),
    [all, setAll] = useState(false),
    [message, setMessage] = useState("");
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const r = await fetch(
          `/api/admin/account-privacy?offset=${(page - 1) * 25}&all=${all ? "1" : "0"}`,
          { cache: "no-store", signal },
        );
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (!signal?.aborted) setData(d);
      } catch (error) {
        if (!signal?.aborted)
          setMessage(
            error instanceof Error
              ? error.message
              : "Privacy requests are unavailable.",
          );
      }
    },
    [page, all],
  );
  useEffect(() => {
    const c = new AbortController();
    setData(null);
    void load(c.signal);
    return () => c.abort();
  }, [load]);
  return (
    <section className="panel" id="privacy-requests">
      <p className="eyebrow">Private administration</p>
      <h2>Account privacy requests.</h2>
      <p>
        Review deletion and information-copy requests from every account type.
        This queue records your response and outcome. It does not perform
        account erasure, cancel billing or deliver a larger export
        automatically.
      </p>
      <p>
        Before marking a request complete, verify the requester, handle the
        requested records through the privacy procedure, and explain any
        specific retained records, legal basis and expiry or review date.
        Arrange owner transfer for shared businesses and address subscriptions
        separately. The response below is visible to the requester.
      </p>
      {data && (
        <p role="status">
          {data.open} open · {data.overdue} overdue
        </p>
      )}
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={all}
          onChange={(e) => {
            setPage(1);
            setAll(e.target.checked);
          }}
        />
        Include completed and withdrawn requests
      </label>
      <button className="button secondary small" onClick={() => void load()}>
        Refresh requests
      </button>
      {message && <p role="status">{message}</p>}
      {!data && <p role="status">Loading privacy requests…</p>}
      {data?.requests.map((r) => (
        <PrivacyReview
          key={r.id + ":" + r.updated_at}
          request={r}
          onSaved={async () => {
            await load();
          }}
        />
      ))}
      {data && !data.requests.length && (
        <p className="muted">No requests in this view.</p>
      )}
      <PageControls
        page={page}
        total={data?.total || 0}
        size={25}
        label="Privacy request pages"
        onPage={setPage}
        busy={!data}
      />
    </section>
  );
}
function PrivacyReview({
  request: r,
  onSaved,
}: {
  request: Request;
  onSaved: () => Promise<void>;
}) {
  const [status, setStatus] = useState("in_review"),
    [response, setResponse] = useState(r.response),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <article className="activity-item">
      <h3>
        {r.kind === "deletion"
          ? "Account and information deletion"
          : "Complete information copy"}{" "}
        · {privacyStatus[r.status]}
      </h3>
      <p>
        {r.email} · {r.account_kind} ·{" "}
        {r.user_id ? "Account linked" : "Account record no longer present"}
      </p>
      <p>
        Requested {new Date(r.created_at).toLocaleString("en-AU")} · response
        due {new Date(r.due_at).toLocaleDateString("en-AU")}
      </p>
      {r.details && <p>{r.details}</p>}
      {r.response && <p className="notice">Recorded response: {r.response}</p>}
      {["requested", "in_review"].includes(r.status) && (
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMessage("");
            try {
              const d = await sendJson("/api/admin/account-privacy", {
                id: r.id,
                version: r.updated_at,
                status,
                response,
              });
              setMessage(d.message);
              await onSaved();
            } catch (error) {
              setMessage(
                error instanceof Error
                  ? error.message
                  : "Response could not be saved.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field-label">
            Request status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={busy}
            >
              <option value="in_review">Under review</option>
              <option value="completed">
                Completed — action handled separately
              </option>
              <option value="declined">
                Unable to fulfil as requested — explain why
              </option>
            </select>
          </label>
          <label className="field-label">
            Response to the requester
            <textarea
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              required
              minLength={10}
              maxLength={6000}
              disabled={busy}
            />
          </label>
          <button className="button primary" disabled={busy}>
            {busy ? "Recording…" : "Record response and status"}
          </button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </article>
  );
}
