"use client";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "./providers";
import { sendJson } from "./trust-workflows";

type Suppression = {
  email: string;
  audience: string;
  source: string;
  reason: string;
  unsubscribed_at: string;
  updated_at: string;
};
type List = { rows: Suppression[]; total: number };
const sourceLabels: Record<string, string> = {
  settings: "Account settings",
  email_unsubscribe: "Email unsubscribe button",
  launch_unsubscribe: "Launch email opt-out",
  admin: "Manual admin entry",
};
export function MarketingAdministration() {
  const session = useSession();
  return session.staffRole === "admin" ? <SuppressionRegister /> : null;
}
function SuppressionRegister() {
  const [data, setData] = useState<List | null>(null),
    [query, setQuery] = useState(""),
    [offset, setOffset] = useState(0),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch(
          `/api/admin/marketing?q=${encodeURIComponent(query)}&offset=${offset}`,
          { cache: "no-store", signal },
        );
        const result = await response.json();
        if (!response.ok)
          throw Error(
            result.error || "The unsubscribe register is unavailable.",
          );
        if (!signal?.aborted) setData(result);
      } catch (error) {
        if (!signal?.aborted)
          setMessage(
            error instanceof Error ? error.message : "Please try again.",
          );
      }
    },
    [query, offset],
  );
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    void load(controller.signal);
    const refresh = () => {
      if (document.visibilityState === "visible") void load(controller.signal);
    };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);
  return (
    <section className="panel marketing-register" id="marketing-unsubscribes">
      <p className="eyebrow">Marketing communications</p>
      <h2>Unsubscribe register.</h2>
      <p>
        Email-button withdrawals and changes in Settings appear here
        automatically. Add an address manually when someone asks you to stop
        marketing, including contacts who do not have a Westmere account.
      </p>
      <details>
        <summary>Add a manual unsubscribe</summary>
        <form
          className="form-stack"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget,
              fields = new FormData(form);
            setBusy(true);
            setMessage("");
            try {
              const result = await sendJson("/api/admin/marketing", {
                email: String(fields.get("email") || "").trim(),
                reason: fields.get("reason"),
              });
              setMessage(result.message);
              form.reset();
              if (offset) setOffset(0);
              else await load();
            } catch (error) {
              setMessage(
                error instanceof Error
                  ? error.message
                  : "The address could not be added.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Email address
            <input name="email" type="email" maxLength={254} required />
          </label>
          <label>
            Request or reason
            <textarea
              name="reason"
              minLength={10}
              maxLength={2000}
              rows={3}
              required
              placeholder="How and when did this person ask to unsubscribe?"
            />
          </label>
          <div>
            <button className="button secondary" disabled={busy}>
              {busy ? "Saving…" : "Add to unsubscribe register"}
            </button>
          </div>
        </form>
      </details>
      <form
        className="marketing-register-search"
        onSubmit={(event) => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          setOffset(0);
          setQuery(String(fields.get("q") || "").trim());
        }}
      >
        <label>
          Find an email address
          <input
            name="q"
            type="search"
            maxLength={254}
            placeholder="Search unsubscribed addresses"
          />
        </label>
        <button className="button secondary small" type="submit">
          Search
        </button>
        <button
          className="text-button"
          type="button"
          onClick={() => void load()}
        >
          Refresh
        </button>
      </form>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {!data ? (
        <p role="status">Loading unsubscribe register…</p>
      ) : (
        <>
          <p className="fineprint">
            {data.total ? `${offset + 1}–${offset + data.rows.length}` : "0"} of{" "}
            {data.total} unsubscribed addresses · Refreshes every 15 seconds
            while this panel is open.
          </p>
          {data.rows.length ? (
            <div className="marketing-register-table">
              <table>
                <caption className="sr-only">
                  Addresses excluded from Westmere marketing emails
                </caption>
                <thead>
                  <tr>
                    <th>Email address</th>
                    <th>Account type</th>
                    <th>Unsubscribed</th>
                    <th>Source and reason</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.email}>
                      <td>{row.email}</td>
                      <td>{row.audience}</td>
                      <td>
                        {new Date(row.unsubscribed_at).toLocaleString("en-AU")}
                      </td>
                      <td>
                        <strong>
                          {sourceLabels[row.source] || row.source}
                        </strong>
                        <br />
                        {row.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>
              {query
                ? "No matching unsubscribed addresses."
                : "No marketing unsubscribes recorded."}
            </p>
          )}
          <div className="actions-row">
            <button
              className="button secondary small"
              disabled={offset === 0 || busy}
              onClick={() => setOffset(Math.max(0, offset - 25))}
            >
              Previous page
            </button>
            <button
              className="button secondary small"
              disabled={offset + 25 >= data.total || busy}
              onClick={() => setOffset(offset + 25)}
            >
              Next page
            </button>
          </div>
        </>
      )}
    </section>
  );
}
