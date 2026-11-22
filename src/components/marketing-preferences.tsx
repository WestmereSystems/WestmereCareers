"use client";
import { useEffect, useState } from "react";
import { useSession } from "./providers";
import { sendJson } from "./trust-workflows";

export function MarketingPreferences() {
  const session = useSession();
  return session.user ? <PreferencesForAccount key={session.user.id} /> : null;
}
function PreferencesForAccount() {
  const [enabled, setEnabled] = useState(true),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/marketing/preferences", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw Error(
            data.error || "Your marketing preference could not be loaded.",
          );
        if (!controller.signal.aborted) {
          setEnabled(data.enabled === true);
          setLoaded(true);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setMessage(
            error instanceof Error ? error.message : "Please try again.",
          );
      });
    return () => controller.abort();
  }, []);
  return (
    <section className="panel" id="marketing">
      <p className="eyebrow">Email preferences</p>
      <h2>Marketing, on your terms.</h2>
      <p>
        Choose whether to receive Westmere Careers news, offers, launch
        announcements and employer onboarding invitations.
      </p>
      {!loaded ? (
        <p role="status">{message || "Loading your preference…"}</p>
      ) : (
        <form
          className="form-stack"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setMessage("");
            try {
              const data = await sendJson("/api/marketing/preferences", {
                enabled,
              });
              setEnabled(data.enabled === true);
              setMessage(data.message);
            } catch (error) {
              setMessage(
                error instanceof Error
                  ? error.message
                  : "Your preference was not saved. Please try again.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={enabled}
              disabled={busy}
              onChange={(event) => setEnabled(event.target.checked)}
            />
            I want to receive Westmere Careers marketing emails
          </label>
          <p className="fineprint">
            You can change this at any time or use the unsubscribe button in a
            marketing email. Essential account emails and saved-search alerts
            you separately requested have their own settings.
          </p>
          <div>
            <button className="button primary" disabled={busy}>
              {busy ? "Saving…" : "Save marketing preference"}
            </button>
          </div>
          {message && (
            <p className="notice" role="status">
              {message}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
