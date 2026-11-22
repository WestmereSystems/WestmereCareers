"use client";
import { useCallback, useEffect, useState } from "react";
import { CursorControls } from "./page-controls";
type Activity = {
  id: string;
  created_at: string;
  actor_email: string | null;
  actor_id: string | null;
  target_email: string | null;
  target_id: string;
  category: string;
  action: string;
  tier: string | null;
  reason: string;
};
export function AdminActivity() {
  const [rows, setRows] = useState<Activity[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [page, setPage] = useState(0);
  const [cursors, setCursors] = useState<(Activity | undefined)[]>([undefined]);
  const [revision, setRevision] = useState(0);
  const cursor = cursors[page];
  useEffect(() => {
    const c = new AbortController();
    setBusy(true);
    setError("");
    fetch(
      `/api/admin/activity${cursor ? `?before=${encodeURIComponent(cursor.created_at)}&id=${cursor.id}` : ""}`,
      { cache: "no-store", signal: c.signal },
    )
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (!c.signal.aborted) {
          setRows(d.activity);
          setMore(d.hasMore);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted)
          setError(e instanceof Error ? e.message : "Activity unavailable.");
      })
      .finally(() => {
        if (!c.signal.aborted) setBusy(false);
      });
    return () => c.abort();
  }, [cursor, revision]);
  const refresh = useCallback(() => {
    setPage(0);
    setCursors([undefined]);
    setRevision((r) => r + 1);
  }, []);
  useEffect(() => {
    window.addEventListener("westmere-admin-activity", refresh);
    return () => window.removeEventListener("westmere-admin-activity", refresh);
  }, [refresh]);
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>Admin activity</h2>
        <button
          className="button secondary small"
          disabled={busy}
          onClick={refresh}
        >
          Refresh activity
        </button>
      </div>
      <p className="fineprint">
        Shared history preserves the account that performed each action,
        including former administrators.
      </p>
      {error && (
        <p role="alert" className="message">
          {error}
        </p>
      )}
      <div className="insights-table-scroll">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Actioned by</th>
              <th>Account or record</th>
              <th>Action</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.created_at).toLocaleString("en-AU")}</td>
                <td>{r.actor_email || r.actor_id || "System"}</td>
                <td>{r.target_email || r.target_id}</td>
                <td>
                  {r.category} · {r.action}
                  {r.tier ? ` · ${r.tier}` : ""}
                </td>
                <td>{r.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && !busy && !error && <p>No admin activity yet.</p>}
      <CursorControls
        page={page}
        more={more}
        busy={busy}
        label="Admin activity pages"
        onPrevious={() => setPage((p) => p - 1)}
        onNext={() => {
          const last = rows.at(-1);
          if (!last) return;
          setCursors((c) => [...c.slice(0, page + 1), last]);
          setPage((p) => p + 1);
        }}
      />
    </section>
  );
}
