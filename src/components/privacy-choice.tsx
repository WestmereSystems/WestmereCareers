"use client";
import { discoveryKeyword } from "@/lib/discovery";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useRef } from "react";
export function PrivacyChoice({ inline = false }: { inline?: boolean }) {
  const path = usePathname();
  const [choice, setChoice] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const c = new AbortController();
    const load = () =>
      fetch("/api/privacy/analytics", { signal: c.signal, cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (!c.signal.aborted) {
            setChoice(d.choice);
            setReady(true);
          }
        })
        .catch(() => {});
    void load();
    window.addEventListener("westmere-analytics-change", load);
    return () => {
      c.abort();
      window.removeEventListener("westmere-analytics-change", load);
    };
  }, []);
  const show =
    inline ||
    open ||
    (ready &&
      !choice &&
      (path.startsWith("/jobs") || path.startsWith("/companies")));
  async function save(next: string) {
    setBusy(true);
    try {
      const r = await fetch("/api/privacy/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choice: next }),
      });
      if (!r.ok) throw new Error();
      setChoice(next);
      setOpen(false);
      window.dispatchEvent(new Event("westmere-analytics-change"));
    } catch {
      setMessage(
        "Your choice was not saved. Your previous setting remains in place. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {!inline && (
        <div className="privacy-choice">
          <button onClick={() => setOpen(!open)}>
            Privacy & analytics choices
          </button>
          {choice &&
            ` · ${choice === "allow" ? "Optional analytics allowed" : "Optional analytics off"}`}
        </div>
      )}
      {show && (
        <aside
          className={
            inline ? "panel analytics-settings" : "privacy-choice-panel"
          }
          aria-label="Optional analytics choice"
        >
          <h3>
            {inline
              ? "Analytics settings"
              : "A clearer picture, with your choice."}
          </h3>
          {inline && (
            <p role="status">
              {!ready
                ? "Loading your choice…"
                : choice === "allow"
                  ? "Optional analytics allowed"
                  : "Optional analytics off"}
              . Change this at any time. This preference applies to this browser
              on this device.
            </p>
          )}
          <p>
            Allow optional first-party analytics to help employers understand
            search appearances, listing views and broad visitor regions. We
            record aggregate counts and recognised career keywords by broad
            visitor state, without your CV, account ID or precise location. A
            daily keyed network identifier limits misuse for up to 48 hours.
            Your choice is stored for a year.{" "}
            <Link href="/privacy#privacy-13">Read more</Link>.
          </p>
          <div className="hero-actions">
            <button
              className="button secondary"
              disabled={busy}
              aria-pressed={choice === "decline"}
              onClick={() => void save("decline")}
            >
              {choice === "decline"
                ? "Keep analytics off"
                : "Disable analytics"}
            </button>
            <button
              className="button secondary"
              disabled={busy}
              aria-pressed={choice === "allow"}
              onClick={() => void save("allow")}
            >
              Allow analytics
            </button>
          </div>
          {choice && !inline && (
            <button className="text-button" onClick={() => setOpen(false)}>
              Close
            </button>
          )}
          {message && <p role="status">{message}</p>}
        </aside>
      )}
    </>
  );
}
export function DiscoveryEvent({
  organisations,
  kind,
  keyword = "",
  jobId,
}: {
  organisations: string[];
  kind: "search" | "listing" | "profile";
  keyword?: string;
  jobId?: string;
}) {
  const key = JSON.stringify([...new Set(organisations)].sort());
  const views = useRef<{ key: string; id: string; recorded: boolean } | null>(
    null,
  );
  useEffect(() => {
    const ids = JSON.parse(key) as string[];
    if (!ids.length) return;
    const viewKey = JSON.stringify([key, kind, keyword, jobId]);
    if (views.current?.key !== viewKey)
      views.current = {
        key: viewKey,
        id: crypto.randomUUID(),
        recorded: false,
      };
    const view = views.current;
    async function record() {
      try {
        const pref = await fetch("/api/privacy/analytics", {
          cache: "no-store",
        }).then((r) => r.json());
        if (pref.choice !== "allow" || view.recorded) return;
        const response = await fetch("/api/discovery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          body: JSON.stringify({
            view: view.id,
            organisations: ids,
            kind,
            ...(jobId ? { jobId } : {}),
            keyword: discoveryKeyword(keyword),
          }),
        });
        if (response.ok) view.recorded = true;
      } catch {}
    }
    void record();
    const changed = () => void record();
    window.addEventListener("westmere-analytics-change", changed);
    return () => {
      window.removeEventListener("westmere-analytics-change", changed);
    };
  }, [key, kind, keyword, jobId]);
  return null;
}
