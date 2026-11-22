"use client";
import Link from "next/link";
import { useState } from "react";
export function LaunchUpdateForm() {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/launch/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "candidate",
          email: f.get("email"),
          website: f.get("website") || "",
          consent: f.get("consent") === "on",
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Please try again.");
      setMessage(d.message);
      setDone(true);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Your request could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="panel founding-form"
      aria-label="Request a candidate launch update"
    >
      {!done && (
        <>
          <label>
            Email address
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
            />
          </label>
          <div className="founding-honeypot" aria-hidden="true">
            <label>
              Leave this field empty
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          <label className="checkbox-label">
            <input name="consent" type="checkbox" required />
            Email me about Westmere’s Australia-wide launch. I can withdraw this
            request at any time.
          </label>
          <p className="fineprint">
            Launch updates only. This does not start an account, subscription or
            ongoing newsletter. See{" "}
            <Link href="/privacy">how Westmere handles your information</Link>.
            To withdraw your request, email hello@westmere.com.au.
          </p>
          <button className="button primary" disabled={busy}>
            {busy ? "Saving your request…" : "Request a launch update"}
          </button>
        </>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
    </form>
  );
}
