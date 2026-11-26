"use client";
import Script from "next/script";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "./providers";
import {
  ADS_OPTOUT_COOKIE,
  clickIdentifiers,
  deniedGoogleConsent,
  googleConsent,
  isEmployerPath,
  type AdsBrowserState,
} from "@/lib/ads/contracts";
import {
  initializeGoogleTag,
  queueRegistration,
  type GoogleTag,
} from "@/lib/ads/browser";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: GoogleTag;
    westmereAds?: { tagId: string; pending: Set<string> };
  }
}
const gpcEnabled = () =>
  Boolean(
    (navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl,
  );
function denyTag() {
  window.gtag?.("set", "user_data", null);
  window.gtag?.("consent", "update", deniedGoogleConsent);
}
function pendingOptout() {
  return (
    typeof document !== "undefined" &&
    document.cookie
      .split(";")
      .some((v) => v.trim() === `${ADS_OPTOUT_COOKIE}=1`)
  );
}
function setPendingOptout(enabled: boolean) {
  document.cookie = `${ADS_OPTOUT_COOKIE}=${enabled ? "1" : ""}; Max-Age=${enabled ? 90 * 86400 : 0}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}
function removeAdvertisingCookies() {
  for (const name of document.cookie
    .split(";")
    .map((v) => v.trim().split("=")[0])
    .filter((n) => n.startsWith("_gcl_"))) {
    for (const domain of [
      "",
      `; domain=${location.hostname}`,
      `; domain=.${location.hostname}`,
    ])
      document.cookie = `${name}=; Max-Age=0; path=/${domain}; SameSite=Lax`;
  }
}
export function AdvertisingMeasurement() {
  const path = usePathname();
  const session = useSession();
  const [state, setState] = useState<AdsBrowserState | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [prepared, setPrepared] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [measurement, setMeasurement] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [enhanced, setEnhanced] = useState(false);
  const userId = session.user?.id;
  const isBusiness = session.business?.kind === "employer";
  const eligible =
    !session.loading &&
    (userId
      ? isBusiness &&
        (isEmployerPath(path) || /^\/(launch\/)?account(\/|$)/.test(path))
      : isEmployerPath(path));
  useEffect(() => {
    denyTag();
    setLoaded(false);
    setPrepared(false);
    setState(null);
    const abort = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/ads/context", {
          cache: "no-store",
          signal: abort.signal,
        });
        if (!response.ok) return;
        let next = (await response.json()) as AdsBrowserState;
        if (next.enabled && eligible && next.consent) {
          const identifiers = clickIdentifiers(
            Object.fromEntries(new URLSearchParams(location.search)),
          );
          const sync = await fetch("/api/ads/context", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ identifiers, gpc: gpcEnabled() }),
            signal: abort.signal,
          });
          if (!sync.ok) return;
          next = await sync.json();
        }
        if (!abort.signal.aborted) {
          setState(next);
          setMeasurement(next.consent?.measurement ?? false);
          setSharing(next.consent?.adUserData ?? false);
          setEnhanced(next.consent?.enhanced ?? false);
        }
      } catch {
        /* Optional measurement cannot affect the application. */
      }
    }
    if (!session.loading) void load();
    return () => {
      abort.abort();
      denyTag();
    };
  }, [path, userId, isBusiness, session.loading, eligible]);
  const active = Boolean(
    eligible &&
    state?.delivery &&
    state.consent?.measurement &&
    state.consent.adUserData &&
    !pendingOptout(),
  );
  useEffect(() => {
    if (!active || !state?.consent || gpcEnabled()) {
      denyTag();
      return;
    }
    window.dataLayer = window.dataLayer || [];
    if (!window.gtag)
      window.gtag = function () {
        window.dataLayer!.push(arguments);
      };
    const locationWithoutQuery = location.origin + path;
    if (!window.westmereAds) {
      initializeGoogleTag(
        window.gtag,
        state.tagId,
        state.consent,
        locationWithoutQuery,
      );
      window.westmereAds = { tagId: state.tagId, pending: new Set() };
    } else {
      if (window.westmereAds.tagId !== state.tagId) return;
      window.gtag("set", "user_data", null);
      window.gtag("consent", "update", googleConsent(state.consent));
      window.gtag("set", {
        page_location: locationWithoutQuery,
        page_referrer: "",
      });
    }
    setPrepared(true);
  }, [active, state, path]);
  useEffect(() => {
    const event = state?.registration;
    if (
      !loaded ||
      !active ||
      !event ||
      !state.consent ||
      !window.gtag ||
      !window.westmereAds ||
      gpcEnabled()
    )
      return;
    const pending = window.westmereAds.pending;
    if (pending.has(event.id)) return;
    pending.add(event.id);
    queueRegistration(
      window.gtag,
      event,
      state.consent,
      location.origin + path,
      () => {
        // A callback records dispatch only. Ads diagnostics establish processing.
        void fetch("/api/ads/registration", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId: event.id }),
          keepalive: true,
        })
          .then((r) => {
            if (!r.ok) pending.delete(event.id);
          })
          .catch(() => pending.delete(event.id));
      },
    );
  }, [loaded, active, state, path]);
  async function save(disable = false) {
    setBusy(true);
    setMessage("");
    try {
      if (
        disable ||
        !measurement ||
        !sharing ||
        (state?.consent?.enhanced && !enhanced)
      ) {
        setPendingOptout(true);
        denyTag();
        removeAdvertisingCookies();
      }
      const response = await fetch("/api/ads/context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          measurement: !disable && measurement,
          adUserData: !disable && sharing,
          enhanced: !disable && enhanced,
          identifiers: clickIdentifiers(
            Object.fromEntries(new URLSearchParams(location.search)),
          ),
          gpc: gpcEnabled(),
        }),
      });
      if (!response.ok) throw new Error();
      const next = (await response.json()) as AdsBrowserState;
      setPendingOptout(false);
      setState(next);
      setMeasurement(next.consent?.measurement ?? false);
      setSharing(next.consent?.adUserData ?? false);
      setEnhanced(next.consent?.enhanced ?? false);
      setOpen(false);
    } catch {
      setMessage(
        "Your advertising choice could not be saved. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!state?.enabled) return null;
  const show = open || (eligible && !state.consent);
  return (
    <div className="privacy-choice advertising-choice">
      {prepared && active && (
        <Script
          id="westmere-google-ads"
          src={`https://www.googletagmanager.com/gtag/js?id=${state.tagId}`}
          strategy="afterInteractive"
          onReady={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            denyTag();
          }}
        />
      )}
      <button onClick={() => setOpen(!open)}>
        Advertising measurement choices
      </button>
      {show && (
        <aside
          className="privacy-choice-panel"
          aria-label="Advertising measurement choices"
        >
          <h3>Your choice about advertising measurement</h3>
          <p>
            Help us understand which Google ads lead to employer registrations
            and first subscription payments. This is optional and does not
            affect your account or payments.
          </p>
          <label>
            <input
              type="checkbox"
              checked={measurement}
              onChange={(e) => setMeasurement(e.target.checked)}
              disabled={busy}
            />{" "}
            Allow Google Ads measurement cookies on this browser.
          </label>
          <label>
            <input
              type="checkbox"
              checked={sharing}
              onChange={(e) => setSharing(e.target.checked)}
              disabled={busy}
            />{" "}
            Share employer conversion details and ad-click identifiers with
            Google.
          </label>
          <p>
            Both choices are needed for measurement. We share the event time, an
            opaque transaction ID and, for a first subscription payment, revenue
            excluding GST. We do not send jobseeker information, CVs,
            application contents or card details, and we keep advertising
            personalisation off.
          </p>
          {state.enhancedAvailable && (
            <label>
              <input
                type="checkbox"
                checked={enhanced}
                onChange={(e) => setEnhanced(e.target.checked)}
                disabled={busy || !measurement || !sharing}
              />{" "}
              Also use my hashed employer email to improve conversion matching.
            </label>
          )}
          <p>
            These choices apply to this browser for up to 90 days. You can
            change them here at any time.{" "}
            <Link href="/privacy#privacy-13">Read the privacy details</Link>.
          </p>
          <div className="hero-actions">
            <button
              className="button secondary"
              onClick={() => void save(true)}
              disabled={busy}
            >
              Keep measurement off
            </button>
            <button
              className="button secondary"
              onClick={() => void save()}
              disabled={busy}
            >
              Save choices
            </button>
          </div>
          {state.consent && (
            <button className="text-button" onClick={() => setOpen(false)}>
              Close
            </button>
          )}
          {message && <p role="status">{message}</p>}
        </aside>
      )}
    </div>
  );
}
