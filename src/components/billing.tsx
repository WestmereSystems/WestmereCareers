"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Check,
  CreditCard,
  ExternalLink,
  LoaderCircle,
  X,
  ShieldCheck,
} from "lucide-react";
import { useSession } from "./providers";
import { useNotice } from "./notices";
import { sandboxPlans } from "@/lib/billing-plans";
import { businessPlanFeatures } from "@/lib/plan-features";
import { InvoiceHistory } from "./invoice-history";
import terms from "@/content/terms-and-conditions.json";
const money = (c: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(
    c / 100,
  );
type BillingData = {
  paymentsReady?: boolean;
  sandbox: boolean;
  audience: string;
  testing: { tier: string; expiresAt: string } | null;
  hasCustomer: boolean;
  subscription: {
    status: string;
    plan: string;
    renewsAt: string;
    cancelAtPeriodEnd: boolean;
    scheduledChange: boolean;
  } | null;
  paymentMethod: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  } | null;
  invoices: {
    id: string;
    number: string;
    status: string;
    total: number;
    date: number;
    url: string | null;
    pdf: string | null;
  }[];
};
export function Billing() {
  const session = useSession(),
    notice = useNotice();
  const orgs =
    session.business?.organisations.filter((o) => o.role === "owner") || [];
  const org = orgs.find((o) => o.verified)?.id || orgs[0]?.id || "";
  const userId = session.user?.id;
  const isBusiness = Boolean(session.business);
  const [data, setData] = useState<BillingData | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  useEffect(() => setTermsAccepted(false), [userId]);
  async function acceptTerms(event: React.FormEvent) {
    event.preventDefault();
    if (!termsAccepted || busy) return;
    setBusy("terms");
    setError("");
    try {
      const response = await fetch("/api/employers/terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          termsAccepted: true,
          termsVersion: terms.version,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Please try again.");
      await session.refresh();
      setTermsAccepted(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Please try again.");
    } finally {
      setBusy("");
    }
  }
  useEffect(() => {
    if (!session.user || (session.business && !org)) return;
    const c = new AbortController();
    setError("");
    fetch(`/api/billing/account${org ? `?organisation=${org}` : ""}`, {
      cache: "no-store",
      signal: c.signal,
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (!c.signal.aborted) setData(d);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [org, userId, isBusiness]);
  async function act(action: "checkout" | "portal" | "change", plan?: string) {
    if (!session.user) {
      session.openAuth();
      return;
    }
    setBusy(plan || action);
    try {
      const r = await fetch("/api/billing/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organisation: org || null, action, plan }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      const url = new URL(d.url);
      if (
        url.protocol !== "https:" ||
        !["checkout.stripe.com", "billing.stripe.com"].includes(url.hostname)
      )
        throw Error("The billing destination could not be verified.");
      window.location.assign(url.href);
    } catch (e) {
      notice({
        title: "Billing update",
        message: e instanceof Error ? e.message : "Please try again.",
        tone: "error",
      });
      setBusy("");
    }
  }
  const audience = session.business?.kind || "individual";
  const sandbox = data?.sandbox ?? session.billingSandbox;
  return (
    <section className="billing-workspace">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Your plan, in your hands</p>
          <h2>Billing.</h2>
        </div>
        <span className="badge">
          <ShieldCheck size={15} />{" "}
          {sandbox
            ? "Sandbox · test payments only"
            : data?.paymentsReady === false
              ? "Payments being prepared"
              : "Live subscription payments"}
        </span>
      </div>
      <p className="muted">
        {sandbox
          ? "This account uses sandbox subscriptions. No real money is charged; GST collection is disabled in this test environment."
          : "Paid subscriptions renew monthly until cancelled. Prices are in Australian dollars. GST is not currently charged. Review charges before confirming in Stripe."}
      </p>
      {data?.paymentsReady === false && (
        <p className="notice">
          Payments are being prepared. Registration and private launch
          preparation remain available. No payment has been taken.
        </p>
      )}
      {session.business && !session.marketplaceOpen && (
        <p className="notice">
          Subscriptions are optional. Your business details and vacancies remain
          private during founding onboarding. A subscription does not bypass
          verification or make content public.
        </p>
      )}
      {session.business && orgs.length > 0 && (
        <p className="notice">
          One billing plan for your account ({session.user?.email}).{" "}
          <Link className="text-link" href="/account?tab=profile">
            Choose the businesses covered by this plan in Profile →
          </Link>
        </p>
      )}
      {session.business && (
        <p className="notice">
          {audience === "agency"
            ? "Agency hiring uses the vacancy, authorised-client and recruiter allowances of your active agency plan."
            : "Free business accounts include one active job posting per company."}{" "}
          Listings expire after 40 days and can be renewed while retaining their
          statistics.
        </p>
      )}
      {session.business?.needsOnboarding && (
        <form
          className="panel billing-terms-renewal form-stack"
          onSubmit={acceptTerms}
        >
          <h3>Accept the current Terms to enable plan changes.</h3>
          <p>
            Your business account needs the current Terms acceptance before a
            new subscription or plan change. Existing payment and cancellation
            controls remain available.
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(event) => setTermsAccepted(event.target.checked)}
              disabled={!!busy}
            />
            <span>
              I have read and accept the current{" "}
              <Link href="/terms" target="_blank" rel="noopener noreferrer">
                Terms and Conditions
              </Link>{" "}
              for my business account.
            </span>
          </label>
          <div className="actions-row">
            <button
              className="button primary"
              disabled={!termsAccepted || !!busy}
            >
              {busy === "terms"
                ? "Saving acceptance…"
                : "Accept Terms and enable plan changes"}
            </button>
            <Link href="/employers/sign-in?complete=1" className="text-link">
              Complete account setup
            </Link>
          </div>
        </form>
      )}
      {session.business &&
        (!org || !orgs.find((o) => o.id === org)?.verified) && (
          <p className="notice">
            Verify your business before starting a test subscription. Payment
            management is restricted to the billing owner; existing payment and
            cancellation controls remain available when verification is
            suspended.
          </p>
        )}
      {!session.user && (
        <button className="button primary" onClick={session.openAuth}>
          Sign in to manage billing
        </button>
      )}
      {error && (
        <p className="message error-message" role="alert">
          {error}
        </p>
      )}
      {data && (
        <>
          <div className="billing-summary panel dot-surface">
            <CreditCard />
            <div>
              <h3>
                {sandboxPlans.find((p) => p.code === data.subscription?.plan)
                  ?.name || "Free account · no paid subscription"}
              </h3>
              <p>
                {data.subscription
                  ? `${data.subscription.status} · ${data.subscription.cancelAtPeriodEnd ? "Ends" : "Auto-renews"} ${new Date(data.subscription.renewsAt).toLocaleDateString("en-AU")}`
                  : session.business
                    ? "One active job posting per company is included free."
                    : sandbox
                      ? "Choose a sandbox plan below."
                      : "Choose a subscription plan below."}
              </p>
              {data.subscription?.scheduledChange && (
                <p>A plan change is scheduled. Manage it in Stripe.</p>
              )}
              {data.testing && (
                <p className="badge">
                  Testing access: {data.testing.tier} · expires{" "}
                  {new Date(data.testing.expiresAt).toLocaleDateString("en-AU")}
                  . Separate from paid billing.
                </p>
              )}
              <p className="fineprint">
                {data.paymentMethod
                  ? `${data.paymentMethod.brand} •••• ${data.paymentMethod.last4} · expires ${data.paymentMethod.expMonth}/${data.paymentMethod.expYear}`
                  : "No default card shown. Stripe may also hold a subscription-specific payment method."}
              </p>
            </div>
            {data.hasCustomer && (
              <button
                className="button secondary"
                disabled={!!busy}
                onClick={() => act("portal")}
              >
                Manage billing <ExternalLink size={16} />
              </button>
            )}
          </div>
        </>
      )}
      <div className="billing-plan-grid">
        {sandboxPlans
          .filter((p) => p.audience === audience)
          .map((p) => (
            <article
              className={`panel ${data?.subscription?.plan === p.code ? "current-plan" : ""}`}
              key={p.code}
            >
              <p className="eyebrow">
                {sandbox ? "Sandbox plan" : "Monthly plan"}
              </p>
              <h3>{p.name}</h3>
              <p className="plan-price">
                {money(p.amount)}
                <small>/month</small>
              </p>
              <p>
                {p.code === "careers_plus"
                  ? "100 Assistant requests per billing period, CV reviews and role-specific preparation."
                  : p.code.endsWith("starter")
                    ? "Company profile, job management and hiring statistics."
                    : "Hiring tools, Discovery and search insights by visitor state."}
              </p>
              <ul className="plan-features">
                {(p.code === "careers_plus"
                  ? [
                      "100 Assistant requests per billing period",
                      "CV reviews and role-specific preparation",
                      "Up to 10 saved chats",
                      "Role Strength and Strong Matches",
                    ].map((label) => ({ label, included: true }))
                  : businessPlanFeatures(p.code)
                ).map(({ label, included }) => (
                  <li
                    key={label}
                    className={
                      included ? "feature-included" : "feature-unavailable"
                    }
                  >
                    {included ? (
                      <Check size={16} aria-hidden="true" />
                    ) : (
                      <X size={16} aria-hidden="true" />
                    )}
                    <span>
                      <span className="sr-only">
                        {included ? "Included: " : "Not included: "}
                      </span>
                      {label}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                className="button primary"
                disabled={
                  !!busy ||
                  (!!session.business &&
                    (!org ||
                      !orgs.find((o) => o.id === org)?.verified ||
                      session.business.needsOnboarding)) ||
                  data?.subscription?.plan === p.code
                }
                onClick={() =>
                  act(
                    data?.subscription &&
                      !["canceled", "incomplete_expired"].includes(
                        data.subscription.status,
                      )
                      ? "change"
                      : "checkout",
                    p.code,
                  )
                }
              >
                {busy === p.code ? (
                  <LoaderCircle className="spin" size={16} />
                ) : null}
                {data?.subscription?.plan === p.code
                  ? "Current plan"
                  : data?.subscription
                    ? "Review plan change"
                    : "Choose test plan"}
              </button>
            </article>
          ))}
      </div>
      {isBusiness && (
        <p className="fineprint">
          {audience === "agency"
            ? "Agency client hiring requires an active agency plan and independently approved authority for each client."
            : "Your free allowance includes one active job advertisement per company. A paid business plan provides the features listed above."}{" "}
          Additional paid advertising placements and separately priced extras
          require a separate order showing the price and included quantity
          before confirmation.
        </p>
      )}
      <div className="panel">
        <h3>Everything you can manage</h3>
        <ul className="billing-options">
          <li>
            Review a plan change in Stripe before confirming. An immediate
            upgrade can charge the prorated difference to your saved payment
            method; authentication may be required.
          </li>
          <li>
            Lower-priced business plans are scheduled for the next renewal. Your
            existing plan remains until then. Credits and any amounts due appear
            in Stripe before confirmation.
          </li>
          <li>
            Update your payment method and billing details, download invoices,
            pay outstanding invoices, and review scheduled changes.
          </li>
          <li>
            New paid subscriptions auto-renew by default. Cancel renewal online.
            Your paid access continues until the period ends. Free personal
            accounts remain free; cancel Careers+ to return to the free plan.
          </li>
          <li>
            Test assignments expire separately and do not create an invoice, a
            payment or verified hiring authority.
          </li>
        </ul>
      </div>
      {data && <InvoiceHistory key={`${userId}:${org}`} organisation={org} />}
      <p className="fineprint">
        Billing status updates after Stripe confirms the change.{" "}
        <Link href="/terms">Subscription terms</Link> ·{" "}
        <Link href="/privacy">Payment privacy</Link>
      </p>
    </section>
  );
}
export function TestingControls() {
  const session = useSession(),
    notice = useNotice();
  const [enabled, setEnabled] = useState(false),
    [email, setEmail] = useState(""),
    [tier, setTier] = useState(""),
    [target, setTarget] = useState<{
      audience: string;
      verified: boolean;
    } | null>(null),
    [days, setDays] = useState("7"),
    [reason, setReason] = useState(""),
    [designate, setDesignate] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/admin/testing", { signal: c.signal })
      .then((r) => r.json())
      .then((d) => {
        if (!c.signal.aborted) setEnabled(d.enabled === true);
      })
      .catch(() => {});
    return () => c.abort();
  }, []);
  async function inspectTarget() {
    setTarget(null);
    setTier("");
    try {
      const r = await fetch(
        `/api/admin/testing?email=${encodeURIComponent(email)}`,
        { cache: "no-store" },
      );
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setTarget(d.account);
    } catch (e) {
      notice({
        title: "Test account",
        message: e instanceof Error ? e.message : "Account unavailable.",
        tone: "error",
      });
    }
  }
  if (!enabled) return null;
  return (
    <form
      className="panel"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const r = await fetch("/api/admin/testing", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email,
              tier: tier === "revoke" ? null : tier,
              days: Number(days),
              reason,
              designate,
            }),
          });
          const d = await r.json();
          if (!r.ok) throw Error(d.error);
          notice({ title: "Test access updated", message: d.message });
          await session.refresh();
          window.dispatchEvent(new Event("westmere-admin-activity"));
        } catch (e) {
          notice({
            title: "Test access",
            message: e instanceof Error ? e.message : "Please retry.",
            tone: "error",
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="eyebrow">Restricted testing controls</p>
      <h3>Assign an expiring test tier</h3>
      <p>
        Use only a dedicated account containing synthetic test data. This does
        not charge a card or verify a business. Each change is audited.
      </p>
      <label className="field-label">
        Exact verified account email
        <input
          type="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setTarget(null);
            setTier("");
          }}
          onBlur={() => {
            if (email.includes("@")) void inspectTarget();
          }}
        />
      </label>
      <button
        type="button"
        className="button secondary small"
        onClick={() => void inspectTarget()}
      >
        Check account type
      </button>
      {target && (
        <p className="notice">
          {target.audience === "individual"
            ? "Personal account · Careers+ test access available."
            : `${target.audience === "agency" ? "Agency" : "Employer"} account · ${target.verified ? "Verified business" : "Verify the owned business before assigning a tier"}.`}
        </p>
      )}
      <label className="field-label">
        Tier
        <select
          required
          disabled={!target}
          value={tier}
          onChange={(e) => setTier(e.target.value)}
        >
          <option value="" disabled>
            Choose the matching test tier
          </option>
          {sandboxPlans
            .filter((p) => p.audience === target?.audience)
            .map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          <option value="revoke">Revoke test access</option>
        </select>
      </label>
      <label className="field-label">
        Days (1–30)
        <input
          type="number"
          min="1"
          max="30"
          required
          value={days}
          onChange={(e) => setDays(e.target.value)}
        />
      </label>
      <label className="field-label">
        Reason
        <textarea
          required
          minLength={10}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <label className="assistant-consent">
        <input
          type="checkbox"
          checked={designate}
          onChange={(e) => setDesignate(e.target.checked)}
        />
        I confirm this is a dedicated test account. Designate it for testing if
        necessary.
      </label>
      <button
        disabled={
          busy ||
          !target ||
          !tier ||
          (tier !== "revoke" &&
            target.audience !== "individual" &&
            !target.verified)
        }
        className="button secondary"
      >
        {busy ? "Saving…" : "Apply test access"}
      </button>
    </form>
  );
}
