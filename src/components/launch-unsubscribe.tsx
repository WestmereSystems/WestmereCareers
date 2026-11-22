"use client";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { sendJson } from "./trust-workflows";
export function LaunchUnsubscribe() {
  const token = useSearchParams().get("token");
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  return (
    <>
      <p>Unsubscribe this address from Westmere Careers marketing emails, including launch announcements.</p>
      <button
        className="button secondary"
        disabled={!token || busy || done}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await sendJson("/api/launch/unsubscribe", { token });
            setMessage(r.message);
            setDone(true);
          } catch (e) {
            setMessage(e instanceof Error ? e.message : "Please try again.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Updating…" : done ? "Unsubscribed" : "Unsubscribe from marketing"}
      </button>
      <p role="status">
        {message ||
          (!token ? "Use the preferences link in your launch email." : "")}
      </p>
    </>
  );
}
