"use client";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "./providers";
import { sendJson } from "./trust-workflows";
type Registration = {
  id: string;
  email: string;
  created_at: string;
  verified: boolean;
  kind: string;
  restricted: boolean;
  staff: boolean;
};
type Recipient = {
  email: string;
  created_at: string;
  registered: boolean;
  opted_in: boolean;
  removed_at: string | null;
  delivery_status: string | null;
};
type Listing = {
  rows: (Registration | Recipient)[];
  total: number;
  marketplaceOpen: boolean;
  announcementQueuedAt: string | null;
  delivery: {
    queued: number;
    accepted: number;
    failed: number;
    canceled: number;
  };
};
export function LaunchAdministration() {
  const session = useSession();
  const [view, setView] = useState<"registrations" | "mailing">(
      "registrations",
    ),
    [offset, setOffset] = useState(0);
  const [data, setData] = useState<Listing | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const r = await fetch(
          `/api/admin/launch/operations?view=${view}&offset=${offset}`,
          { cache: "no-store", signal },
        );
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (!signal?.aborted) setData(d);
      } catch (e) {
        if (!signal?.aborted)
          setMessage(
            e instanceof Error
              ? e.message
              : "Launch administration unavailable.",
          );
      }
    },
    [view, offset],
  );
  useEffect(() => {
    const c = new AbortController();
    setData(null);
    void load(c.signal);
    return () => c.abort();
  }, [load]);
  async function act(
    e: React.FormEvent<HTMLFormElement>,
    action: string,
    user?: string,
    email?: string,
  ) {
    e.preventDefault();
    const form = e.currentTarget,
      fields = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      const r = await sendJson("/api/admin/launch/operations", {
        action,
        reason: fields.get("reason"),
        confirmed: fields.get("confirmed") === "on",
        ...(user ? { user } : {}),
        ...(email ? { email } : {}),
      });
      setMessage(r.message);
      form.reset();
      await load();
      await session.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  if (session.staffRole !== "admin") return null;
  const controls = (label: string) => (
    <>
      <label>
        Decision reason
        <input name="reason" minLength={10} maxLength={2000} required />
      </label>
      <label className="checkbox-label">
        <input type="checkbox" name="confirmed" required />
        {label}
      </label>
    </>
  );
  return (
    <section className="panel founding-admin">
      <p className="eyebrow">Administrator launch desk</p>
      <h2>Launch, registrations and email updates.</h2>
      <p>
        Open Westmere Careers across Australia and send one launch announcement
        to verified registered accounts and homepage launch-update subscribers.
        Duplicate addresses receive one email. Removed, restricted and
        suppressed addresses are excluded. Verified business profiles and
        eligible reviewed roles are included by default, subject to each
        business’s visibility and closed-role choices.
      </p>
      {message && (
        <p className="notice" role="status">
          {message}
        </p>
      )}
      {data && (
        <details>
          <summary>Launch and email announcement</summary>
          <p>
            <strong>Subject:</strong> Westmere Careers is live across Australia
            — Westmere Careers
          </p>
          <blockquote>
            Westmere Careers has launched across Australia. Explore
            opportunities, prepare your next application or open your business
            workspace. Your private account details remain private. Business
            profiles and eligible reviewed vacancies are public by default.
            Businesses can change profile visibility or close individual roles
            in their account.
          </blockquote>
          <p>
            The email links to the production website and includes a
            launch-email removal link. Delivery uses the existing email queue.
          </p>
          {data.announcementQueuedAt ? (
            <p>
              Announcement queued{" "}
              {new Date(data.announcementQueuedAt).toLocaleString("en-AU")}.{" "}
              {data.delivery.queued} pending · {data.delivery.accepted} accepted
              or delivered · {data.delivery.failed} need review ·{" "}
              {data.delivery.canceled} cancelled.
            </p>
          ) : (
            <form
              className="form-stack"
              onSubmit={(e) =>
                void act(
                  e,
                  data.marketplaceOpen ? "announce" : "launch_and_email",
                )
              }
            >
              {controls(
                data.marketplaceOpen
                  ? "Send the launch announcement to the eligible mailing list."
                  : "Open the public marketplace and send the launch announcement to the eligible mailing list.",
              )}
              <button className="button primary" disabled={busy}>
                {data.marketplaceOpen
                  ? "Send launch announcement"
                  : "Launch site and send announcement"}
              </button>
            </form>
          )}
        </details>
      )}
      <div
        className="actions-row"
        role="group"
        aria-label="Administrator lists"
      >
        <button
          className="button secondary small"
          aria-pressed={view === "registrations"}
          onClick={() => {
            setOffset(0);
            setView("registrations");
          }}
        >
          All registrations
        </button>
        <button
          className="button secondary small"
          aria-pressed={view === "mailing"}
          onClick={() => {
            setOffset(0);
            setView("mailing");
          }}
        >
          Launch mailing list
        </button>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>
      {!data ? (
        <p role="status">Loading accounts…</p>
      ) : (
        <>
          <p>
            {data.total ? `${offset + 1}–${offset + data.rows.length}` : "0"} of{" "}
            {data.total}{" "}
            {view === "registrations"
              ? "registrations"
              : "mailing-list addresses"}
          </p>
          {data.rows.map((row) => (
            <article key={"id" in row ? row.id : row.email}>
              <strong>{row.email || "No email address"}</strong>
              <p>
                Registered {new Date(row.created_at).toLocaleString("en-AU")}
              </p>
              {"id" in row ? (
                <>
                  <p>
                    {row.kind} ·{" "}
                    {row.verified ? "Email verified" : "Email unverified"} ·{" "}
                    {row.staff
                      ? "Protected staff account"
                      : row.restricted
                        ? "Restricted"
                        : "Access allowed"}
                  </p>
                  {!row.staff && row.id !== session.user?.id && (
                    <details>
                      <summary>
                        {row.restricted
                          ? "Restore account access"
                          : "Restrict account access"}
                      </summary>
                      <form
                        className="form-stack"
                        onSubmit={(e) =>
                          void act(
                            e,
                            row.restricted ? "restore" : "restrict",
                            row.id,
                          )
                        }
                      >
                        {controls(
                          row.restricted
                            ? "Restore this account’s access."
                            : "Block this account’s access, including existing sessions. Billing subscriptions require separate cancellation.",
                        )}
                        <button
                          className="button secondary small"
                          disabled={busy}
                        >
                          {row.restricted
                            ? "Restore access"
                            : "Restrict account"}
                        </button>
                      </form>
                    </details>
                  )}
                </>
              ) : (
                <>
                  <p>
                    {row.registered ? "Registered account" : ""}
                    {row.registered && row.opted_in ? " · " : ""}
                    {row.opted_in ? "Homepage launch update" : ""} ·{" "}
                    {row.removed_at
                      ? "Removed from launch emails"
                      : "On launch mailing list"}
                    {row.delivery_status ? ` · ${row.delivery_status}` : ""}
                  </p>
                  {!row.removed_at && (
                    <details>
                      <summary>Remove from launch mailing list</summary>
                      <form
                        className="form-stack"
                        onSubmit={(e) =>
                          void act(e, "remove_mail", undefined, row.email)
                        }
                      >
                        {controls(
                          "Remove this address and cancel any pending launch email.",
                        )}
                        <button
                          className="button secondary small"
                          disabled={busy}
                        >
                          Remove from list
                        </button>
                      </form>
                    </details>
                  )}
                </>
              )}
            </article>
          ))}
          <div className="actions-row">
            <button
              className="button secondary small"
              disabled={busy || offset === 0}
              onClick={() => setOffset((v) => Math.max(0, v - 25))}
            >
              Previous page
            </button>
            <button
              className="button secondary small"
              disabled={busy || offset + 25 >= data.total}
              onClick={() => setOffset((v) => v + 25)}
            >
              Next page
            </button>
          </div>
        </>
      )}
    </section>
  );
}
