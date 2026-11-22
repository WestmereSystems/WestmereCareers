"use client";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "./providers";
import { ConfirmAction } from "./confirm-action";
import { sendJson } from "./trust-workflows";

export type PrivacyRequest = {
  id: string;
  kind: "deletion" | "information_copy";
  status: "requested" | "in_review" | "completed" | "declined" | "withdrawn";
  details: string;
  response: string;
  created_at: string;
  updated_at: string;
  due_at: string;
};
export const privacyStatus = {
  requested: "Requested",
  in_review: "Under review",
  completed: "Completed",
  declined: "Unable to fulfil as requested",
  withdrawn: "Withdrawn",
};
export function AccountPrivacy() {
  const session = useSession();
  const [data, setData] = useState<{
    email: string;
    requests: PrivacyRequest[];
  } | null>(null);
  const [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [dialog, setDialog] = useState<
      "download" | "deletion" | "information_copy" | null
    >(null),
    [details, setDetails] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const r = await fetch("/api/account/privacy", {
        cache: "no-store",
        signal,
      });
      const d = await r.json();
      if (signal?.aborted) return;
      if (r.status === 401) {
        setData(null);
        return;
      }
      if (!r.ok)
        throw Error(d.error || "Account privacy controls are unavailable.");
      setData(d);
    } catch (error) {
      if (!signal?.aborted)
        setMessage(
          error instanceof Error ? error.message : "Please try again.",
        );
    } finally {
      if (!signal?.aborted) setLoaded(true);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setLoaded(false);
    void load(controller.signal);
    return () => controller.abort();
  }, [session.user?.id, load]);
  const active = (kind: string) =>
    data?.requests.some(
      (r) => r.kind === kind && ["requested", "in_review"].includes(r.status),
    );
  async function confirm() {
    if (!dialog) return;
    setMessage("");
    setBusy(true);
    try {
      if (dialog === "download") {
        const r = await fetch("/api/account/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirmation: true }),
        });
        if (!r.ok) {
          const d = await r.json();
          throw Error(d.error || "Your download could not be prepared.");
        }
        const blob = await r.blob(),
          url = URL.createObjectURL(blob),
          a = document.createElement("a");
        a.href = url;
        a.download = `westmere-account-${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
        setMessage(
          "Your account-information ZIP is ready. Keep the downloaded file private.",
        );
      } else {
        const d = await sendJson("/api/account/privacy", {
          action: "request",
          kind: dialog,
          details,
          confirmation: true,
        });
        setMessage(d.message);
        setDetails("");
        await load();
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="panel"
      id="account-information"
      aria-labelledby="account-information-title"
    >
      <p className="eyebrow">Your information</p>
      <h2 id="account-information-title">Account information and deletion.</h2>
      <p>
        Download your account information or ask Westmere to review an account
        and information deletion request. These controls are available to free
        users, Careers+ members, employers and agencies.
      </p>
      {!loaded ? (
        <p role="status">Loading your account privacy controls…</p>
      ) : !data ? (
        <p>
          Sign in with your verified account to use these controls.{" "}
          <button
            type="button"
            className="text-link"
            onClick={session.openAuth}
          >
            Sign in
          </button>
        </p>
      ) : (
        <>
          <p>
            Your request applies to <strong>{data.email}</strong>. A downloaded
            ZIP contains structured account data and eligible current documents.
            Additional records that need privacy review can be requested
            separately.
          </p>
          <div className="actions-row">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setDialog("download")}
            >
              {busy ? "Please wait…" : "Download my account information"}
            </button>
            <button
              className="button secondary"
              disabled={busy || active("information_copy")}
              onClick={() => {
                setDetails("");
                setDialog("information_copy");
              }}
            >
              Request a complete information copy
            </button>
            <button
              className="button danger"
              disabled={busy || active("deletion")}
              onClick={() => {
                setDetails("");
                setDialog("deletion");
              }}
            >
              Request account and information deletion
            </button>
          </div>
          <p className="fineprint">
            A deletion request goes to Admin for review; it does not immediately
            erase your account or cancel a subscription. We respond within 30
            days and explain any records that must be retained. You can manage
            subscriptions in Billing. Do not include passwords, identity
            documents or other people’s private information in a request.
          </p>
          <h3>Your privacy requests</h3>
          {!data.requests.length && (
            <p className="muted">You have no privacy requests yet.</p>
          )}
          {data.requests.map((r) => (
            <article key={r.id} className="activity-item">
              <h4>
                {r.kind === "deletion"
                  ? "Account and information deletion"
                  : "Complete information copy"}{" "}
                · {privacyStatus[r.status]}
              </h4>
              <p>
                Requested {new Date(r.created_at).toLocaleDateString("en-AU")} ·
                response due {new Date(r.due_at).toLocaleDateString("en-AU")}
              </p>
              {r.details && <p>{r.details}</p>}
              {r.response && (
                <p className="notice">Admin response: {r.response}</p>
              )}
              {["requested", "in_review"].includes(r.status) && (
                <button
                  className="button secondary small"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setMessage("");
                    try {
                      const d = await sendJson("/api/account/privacy", {
                        action: "withdraw",
                        id: r.id,
                        version: r.updated_at,
                      });
                      setMessage(d.message);
                      await load();
                    } catch (error) {
                      setMessage(
                        error instanceof Error
                          ? error.message
                          : "Request could not be withdrawn.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Withdraw this privacy request
                </button>
              )}
            </article>
          ))}
        </>
      )}
      {message && (
        <p role="status" className="message">
          {message}
        </p>
      )}
      {dialog && (
        <ConfirmAction
          title={
            dialog === "download"
              ? "Download your account information?"
              : dialog === "deletion"
                ? "Request account and information deletion?"
                : "Request a complete information copy?"
          }
          confirmLabel={
            dialog === "download"
              ? "Prepare my download"
              : "Submit request to Admin"
          }
          danger={dialog === "deletion"}
          onClose={() => setDialog(null)}
          onConfirm={confirm}
        >
          {dialog === "download" ? (
            <p>
              This ZIP can contain your CVs, applications, saved chats and
              billing references. Save it somewhere private. Preparing the
              download may take a little time. Downloads are limited to once
              every 15 minutes; larger accounts can request a complete copy.
            </p>
          ) : (
            <>
              <p>
                {dialog === "deletion"
                  ? "Admin will assess your account, information, shared business records and any applicable retention duties. This request does not cancel billing or immediately delete records."
                  : "Use this request for a larger export, additional account information or records requiring privacy review."}
              </p>
              <label className="field-label">
                Additional details (optional)
                <textarea
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  maxLength={2000}
                />
              </label>
            </>
          )}
        </ConfirmAction>
      )}
    </section>
  );
}
