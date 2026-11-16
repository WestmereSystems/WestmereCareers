"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Building2, CheckCircle2, Mail } from "lucide-react";
import { useNotice } from "./notices";
import { useSession } from "./providers";
import { sendJson } from "./trust-workflows";
import type { BusinessKind } from "@/lib/business";
export function EmployerSignIn() {
  const notify = useNotice();
  const session = useSession(),
    params = useSearchParams();
  const [kind, setKind] = useState<BusinessKind>(
    params.get("kind") === "agency" ? "agency" : "employer",
  );
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState({ google: false, azure: false });
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/auth/options", { signal: c.signal })
      .then((r) => r.json())
      .then((d) => {
        if (!c.signal.aborted) setProviders(d);
      })
      .catch(() => {});
    return () => c.abort();
  }, []);
  useEffect(() => {
    if (session.user?.email) setEmail(session.user.email);
  }, [session.user?.email]);
  async function finish() {
    const d = await sendJson("/api/employers/account", {
      kind,
      tradingName: company,
      businessEmail: email,
      termsAccepted: accepted,
    });
    window.location.assign(d.redirect);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (session.user) {
        await finish();
        return;
      }
      if (sent) {
        await sendJson("/api/auth/verify", { email, code });
        await session.refresh();
        await finish();
        return;
      }
      await sendJson("/api/auth/sign-in", { email });
      setSent(true);
      notify({
        title: "Check your business inbox",
        message:
          "Your newest sign-in code expires after 15 minutes and can only be used once. Enter it here, or request a new one if it expires.",
      });
    } catch (e) {
      notify({
        title: sent
          ? "That code could not be verified"
          : "Business sign-in unavailable",
        message: e instanceof Error ? e.message : "Please try again.",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }
  async function oauth(provider: "google" | "azure") {
    if (!company.trim() || !accepted) {
      setMessage(
        "Enter your company trading name and agree to the Terms first.",
      );
      return;
    }
    setBusy(true);
    try {
      const d = await sendJson("/api/auth/oauth", {
        provider,
        intent: "employer",
      });
      window.location.assign(d.url);
    } catch (e) {
      notify({
        title: "Provider sign-in unavailable",
        message: e instanceof Error ? e.message : "Please use an email code.",
        tone: "error",
      });
      setBusy(false);
    }
  }
  return (
    <div className="business-auth-layout">
      <section className="business-auth-story dot-surface">
        <span className="round-icon">
          <Building2 />
        </span>
        <p className="eyebrow">Good teams start here</p>
        <h1>
          For Employers<span className="accent">.</span>
        </h1>
        <p>
          Find the talent for your next chapter. Bring clear opportunities to
          the Australian working world.
        </p>
        <ul className="check-list">
          <li>
            <CheckCircle2 />A company profile that tells your story
          </li>
          <li>
            <CheckCircle2 />A clearer view of your hiring
          </li>
          <li>
            <CheckCircle2 />
            Thoughtful candidate communication
          </li>
        </ul>
        <Link href="/employers/preview" className="text-link">
          Take a look inside <ArrowRight size={17} />
        </Link>
      </section>
      <section className="panel business-auth-card">
        <p className="eyebrow">Your hiring workspace</p>
        <h2>
          {session.user
            ? "Complete your business account."
            : "Find your next great hire."}
        </h2>
        <p className="muted">
          Use your <strong>business email address</strong> and your company’s
          trading name. Business verification is required before hiring access
          is granted.
        </p>
        {session.business && (
          <p className="notice">
            Your business account is already set up.{" "}
            <Link href="/account?tab=dashboard">Open your dashboard →</Link>
          </p>
        )}
        <form className="form-stack" onSubmit={submit}>
          <label className="field-label">
            I’m joining as
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as BusinessKind)}
            >
              <option value="employer">An employer</option>
              <option value="agency">A recruitment agency</option>
            </select>
          </label>
          <label className="field-label">
            Company name (trading as)
            <input
              required
              minLength={2}
              maxLength={180}
              autoComplete="organization"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            />
          </label>
          <label className="field-label">
            Business email address
            <input
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              value={email}
              readOnly={Boolean(session.user) || sent}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@your-company.com.au"
            />
          </label>
          {sent && !session.user && (
            <label className="field-label">
              Email sign-in code
              <input
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6,8}"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
          )}
          <label className="consent-row">
            <input
              type="checkbox"
              checked={accepted}
              required
              onChange={(e) => setAccepted(e.target.checked)}
            />
            <span>
              I am at least 18, am authorised to act for this business, and
              agree to the{" "}
              <Link href="/terms" target="_blank">
                Terms and Conditions
              </Link>
              . I have read the{" "}
              <Link href="/privacy" target="_blank">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          {session.user && !session.business && (
            <p className="notice">
              You are signed in with {session.user.email}. Continuing changes
              this account to a business account. Your existing private
              candidate records are not shared with a company, and a personal
              card is not transferred. Use a separate email if you want to
              retain a personal account. Business verification is still required
              before hiring.
            </p>
          )}
          <button className="button primary" disabled={busy || session.loading}>
            <Mail size={18} />
            {busy
              ? "Please wait…"
              : session.user
                ? "Create business workspace"
                : sent
                  ? "Verify & continue"
                  : "Continue with business email"}
            <ArrowRight size={17} />
          </button>
          {sent && !session.user && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setSent(false);
                setCode("");
              }}
            >
              Use a different business email
            </button>
          )}
        </form>
        {!session.user && (
          <>
            <div className="auth-divider">or use your business account</div>
            {(["google", "azure"] as const).map((p) => (
              <button
                key={p}
                className="button secondary oauth-business"
                disabled={busy || !providers[p]}
                onClick={() => void oauth(p)}
              >
                Continue with {p === "google" ? "Google" : "Microsoft"}
                {!providers[p] && " · not connected yet"}
              </button>
            ))}
            <p className="fineprint">
              After provider sign-in, confirm your business details and accept
              the Terms for the authenticated account. Provider sign-in does not
              verify hiring authority.
            </p>
          </>
        )}
        {message && (
          <p role="status" className="message">
            {message}
          </p>
        )}
      </section>
    </div>
  );
}
