"use client";
import { launchPath } from "@/lib/launch-paths";
import { ConfirmAction } from "./confirm-action";
import { ProviderIcon } from "./provider-icons";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Building2, CheckCircle2, Mail } from "lucide-react";
import { useNotice } from "./notices";
import { useSession } from "./providers";
import { sendJson } from "./trust-workflows";
import type { BusinessKind } from "@/lib/business";
export function EmployerSignIn({
  registerByDefault = false,
}: {
  registerByDefault?: boolean;
}) {
  const notify = useNotice();
  const session = useSession(),
    params = useSearchParams();
  const [kind, setKind] = useState<BusinessKind>(
    params.get("kind") === "agency" ? "agency" : "employer",
  );
  const [registering, setRegistering] = useState(
    registerByDefault ||
      params.get("kind") === "agency" ||
      params.get("register") === "1" ||
      params.get("complete") === "1",
  );
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [conversionAccepted, setConversionAccepted] = useState(false);
  const [confirming, setConfirming] = useState(false);
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
  useEffect(() => {
    if (
      !session.loading &&
      session.business &&
      !session.business.needsOnboarding
    )
      window.location.replace(
        launchPath("/account?tab=dashboard", session.marketplaceOpen),
      );
  }, [session.loading, session.business]);
  useEffect(() => {
    if (session.business?.needsOnboarding) {
      setRegistering(true);
      setCompany((current) => current || session.business?.tradingName || "");
      setKind(session.business.kind);
    }
  }, [
    session.business?.needsOnboarding,
    session.business?.tradingName,
    session.business?.kind,
  ]);
  async function finish(confirmed = false) {
    const current = await fetch("/api/session", { cache: "no-store" }).then(
      (r) => r.json(),
    );
    if (current.business && !current.business.needsOnboarding) {
      window.location.assign(
        launchPath("/account?tab=dashboard", session.marketplaceOpen),
      );
      return;
    }
    if (!registering) {
      setRegistering(true);
      return;
    }
    if (!current.business && !conversionAccepted) {
      setMessage(
        "Review and accept the permanent account change below before continuing. You remain signed in.",
      );
      return;
    }
    if (!current.business && !confirmed) {
      setConfirming(true);
      return;
    }
    const d = await sendJson("/api/employers/account", {
      kind,
      tradingName: company,
      businessEmail: email,
      termsAccepted: accepted,
      conversionAccepted,
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
      await sendJson("/api/auth/sign-in", { email, intent: kind });
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
    setBusy(true);
    try {
      const d = await sendJson("/api/auth/oauth", {
        provider,
        intent: kind,
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
    <>
      {confirming && (
        <ConfirmAction
          title="Permanently change this account?"
          confirmLabel="Cancel Careers+ and convert account"
          danger
          onClose={() => setConfirming(false)}
          onConfirm={() => finish(true)}
        >
          <p>
            Your Careers+ subscription will be revoked and cancelled
            immediately. Careers+ access on this business or agency account will
            require Enterprise or higher. You cannot change this account back to
            a standard applicant account.
          </p>
          <p>
            Your private candidate records stay private. Administrator
            permissions, where assigned, are retained.
          </p>
        </ConfirmAction>
      )}
      {!session.marketplaceOpen && (
        <div className="founding-access-note">
          <strong>Register now. Prepare privately for launch.</strong> Your
          business details and vacancies are not public during founding
          onboarding. Sign in and submit the usual verification form. Optional
          subscriptions are available in Billing after verification; subscribing
          does not publish your content.
        </div>
      )}
      <div className="business-auth-layout">
        <section className="business-auth-story dot-surface">
          <span className="round-icon">
            <Building2 />
          </span>
          <p className="eyebrow">Good teams start here</p>
          <h1>
            {kind === "agency" ? "For Agencies" : "For Employers"}
            <span className="accent">.</span>
          </h1>
          <p>
            {session.marketplaceOpen
              ? "Find the talent for your next chapter."
              : "Prepare for the talent in your next chapter."}{" "}
            Bring clear opportunities to the Australian working world.
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
              {session.marketplaceOpen
                ? "Thoughtful candidate communication"
                : "Private preparation before public launch"}
            </li>
          </ul>
          <Link
            href={launchPath("/employers/preview", session.marketplaceOpen)}
            className="text-link"
          >
            Take a look inside <ArrowRight size={17} />
          </Link>
        </section>
        <section className="panel business-auth-card">
          <p className="eyebrow">Your hiring workspace</p>
          <h2>
            {session.business?.needsOnboarding
              ? "Review your business Terms."
              : registering
                ? kind === "agency"
                  ? "Create your agency workspace."
                  : "Create your employer workspace."
                : "Sign in to your hiring workspace."}
          </h2>
          <p className="muted">
            Sign in with your business email. New employers and agencies
            complete separate onboarding and independent verification.
          </p>
          {session.business && (
            <p className="notice">
              Your business account is already set up.{" "}
              <Link href="/account?tab=dashboard">Open your dashboard →</Link>
            </p>
          )}
          <form className="form-stack" onSubmit={submit}>
            {!session.user && (
              <button
                type="button"
                className="text-button"
                onClick={() => setRegistering(!registering)}
              >
                {registering
                  ? "Already registered? Sign in"
                  : "Create an employer or agency workspace"}
              </button>
            )}
            {registering && (
              <>
                <label className="field-label">
                  I’m joining as
                  <select
                    value={kind}
                    disabled={Boolean(session.business)}
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
              </>
            )}
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
            {registering && (
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
            )}
            {session.user && !session.business && (
              <div className="notice">
                <p>
                  You are signed in with {session.user.email}. Continuing
                  permanently converts this account to an employer or agency
                  account. Your Careers+ subscription will be revoked and
                  cancelled immediately, and will stop renewing. Careers+ access
                  on this account will require an Enterprise business/agency
                  subscription or higher. You cannot change this account back to
                  a standard applicant account.
                </p>
                <p>
                  Your candidate records stay private. Business verification is
                  still required. Use a separate email to keep a personal
                  account.
                </p>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    required
                    checked={conversionAccepted}
                    onChange={(e) => setConversionAccepted(e.target.checked)}
                  />
                  I accept the permanent account conversion and cancellation of
                  any personal Careers+ subscription.
                </label>
                {session.staffRole === "admin" && (
                  <p>
                    Your administrator access remains available.{" "}
                    <Link href="/account?tab=admin">
                      Open your admin dashboard
                    </Link>
                    .
                  </p>
                )}
              </div>
            )}
            <button
              className="button primary"
              disabled={busy || session.loading}
            >
              <Mail size={18} />
              {busy
                ? "Please wait…"
                : session.user
                  ? session.business
                    ? "Accept updated business Terms"
                    : "Create business workspace"
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
                  <ProviderIcon provider={p} /> Continue with{" "}
                  {p === "google" ? "Google" : "Microsoft"}
                  {!providers[p] && " · not connected yet"}
                </button>
              ))}
              <p className="fineprint">
                Choose your Google or Microsoft account directly. We’ll use its
                verified email for registration. After signing in, confirm your
                business details and accept the Terms. Provider sign-in does not
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
    </>
  );
}
