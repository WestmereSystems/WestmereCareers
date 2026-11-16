"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CreditCard,
  ExternalLink,
  LoaderCircle,
  Receipt,
  ShieldCheck,
} from "lucide-react";
import { useSession } from "./providers";
import { useNotice } from "./notices";
import { sandboxPlans } from "@/lib/billing-plans";
const money = (c: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(
    c / 100,
  );
type BillingData = {
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
  const [org, setOrg] = useState(orgs[0]?.id || "");
  const [data, setData] = useState<BillingData | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  useEffect(() => {
    if (!session.user || (session.business && !org)) return;
    const c = new AbortController();
    setData(null);
    setError("");
    fetch(`/api/billing/account${org ? `?organisation=${org}` : ""}`, {
      cache: "no-store",
      signal: c.signal,
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setData(d);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [org, session.user, session.business]);
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
  return (
    <section className="billing-workspace">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Your plan, in your hands</p>
          <h2>Billing.</h2>
        </div>
        <span className="badge">
          <ShieldCheck size={15} /> Sandbox · test payments only
        </span>
      </div>
      <p className="muted">
        No real money is charged. These test prices are for development and are
        not an approved live offer. GST collection is disabled in this sandbox.
      </p>
      {session.business && (
        <label className="field-label">
          Business
          <select
            value={org}
            onChange={(e) => {
              setOrg(e.target.value);
              setData(null);
            }}
          >
            <option value="">Choose a business you own</option>
            {orgs.map((o) => (
              <option value={o.id} key={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {session.business && !orgs.length && (
        <p className="notice">
          Verify your business before starting a test subscription. Payment
          management is restricted to the billing owner; existing payment and
          cancellation controls remain available when verification is suspended.
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
                  ? `${data.subscription.status} · ${data.subscription.cancelAtPeriodEnd ? "Ends" : "Renews"} ${new Date(data.subscription.renewsAt).toLocaleDateString("en-AU")}`
                  : "Choose a sandbox plan below."}
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
              <p className="eyebrow">Sandbox plan</p>
              <h3>{p.name}</h3>
              <p className="plan-price">
                {money(p.amount)}
                <small>/month</small>
              </p>
              <p>
                {p.code === "careers_plus"
                  ? "30 AI requests per billing period, CV reviews and role-specific preparation."
                  : p.code.endsWith("starter")
                    ? "Company profile, job management and hiring statistics."
                    : "Hiring tools, Discovery and search insights by visitor state."}
              </p>
              <p className="fineprint">
                Job advertisements and any separately priced extras are not
                included unless expressly agreed.
              </p>
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
            Cancel renewal online. Your paid access continues until the period
            ends. Free personal accounts remain free; cancel Careers+ to return
            to the free plan.
          </li>
          <li>
            Test assignments expire separately and do not create an invoice, a
            payment or verified hiring authority.
          </li>
        </ul>
      </div>
      {data && (
        <div className="panel">
          <h3>
            <Receipt size={20} /> Invoice history
          </h3>
          {data.invoices.length ? (
            <div className="billing-invoices">
              {data.invoices.map((i) => (
                <div key={i.id}>
                  <span>
                    {i.number || "Invoice"} ·{" "}
                    {new Date(i.date * 1000).toLocaleDateString("en-AU")} ·{" "}
                    {i.status}
                  </span>
                  <strong>{money(i.total)}</strong>
                  {i.url && (
                    <a href={i.url} target="_blank" rel="noopener noreferrer">
                      View invoice ↗
                    </a>
                  )}
                  {i.pdf && (
                    <a href={i.pdf} target="_blank" rel="noopener noreferrer">
                      PDF ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No invoices yet.</p>
          )}
        </div>
      )}
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
    [tier, setTier] = useState("careers_plus"),
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
              tier: tier || null,
              days: Number(days),
              reason,
              designate,
            }),
          });
          const d = await r.json();
          if (!r.ok) throw Error(d.error);
          notice({ title: "Test access updated", message: d.message });
          await session.refresh();
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
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="field-label">
        Tier
        <select value={tier} onChange={(e) => setTier(e.target.value)}>
          {sandboxPlans.map((p) => (
            <option key={p.code} value={p.code}>
              {p.name}
            </option>
          ))}
          <option value="">Revoke test access</option>
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
      <button disabled={busy} className="button secondary">
        {busy ? "Saving…" : "Apply test access"}
      </button>
    </form>
  );
}
