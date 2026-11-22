"use client";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { sandboxPlans } from "@/lib/billing-plans";
import { businessPlanFeatures } from "@/lib/plan-features";
import { useSession } from "@/components/providers";

export function LaunchPlans() {
  return (
    <main id="main" className="container page-content founding-page">
      <section className="page-intro">
        <p className="eyebrow">Optional employer and agency subscriptions</p>
        <h1>Choose what fits your next chapter.</h1>
        <p className="founding-lead">
          Register for free and complete business verification first. You can
          then choose an available plan in Billing. A subscription does not
          publish your business or vacancies.
        </p>
      </section>
      <LaunchPlanOptions />
    </main>
  );
}

export function LaunchPlanOptions() {
  const session = useSession();
  return (
    <div id="plans" className="launch-plan-options">
      {" "}
      <p className="notice">
        <strong>Optional monthly subscriptions.</strong>{" "}
        {session.businessPaymentsReady === false
          ? "Payments are being prepared. Register for free, complete verification and review the plans below."
          : "Verified employers and agencies can subscribe during founding launch."}{" "}
        Prices are in Australian dollars. GST is not currently charged. Review
        the final amount and monthly renewal in checkout. Profiles and vacancies
        remain private.
      </p>
      {(["employer", "agency"] as const).map((audience) => (
        <section key={audience} className="founding-plan-section">
          <h2>
            {audience === "agency"
              ? "For recruitment agencies"
              : "For employers"}
          </h2>
          <div className="founding-benefits">
            {sandboxPlans
              .filter((p) => p.audience === audience)
              .map((plan) => (
                <article className="panel" key={plan.code}>
                  <p className="eyebrow">Monthly plan</p>
                  <h3>{plan.name}</h3>
                  <p className="plan-price">
                    A${plan.amount / 100}
                    <small>/month</small>
                  </p>
                  <ul className="plan-features">
                    {businessPlanFeatures(plan.code).map(
                      ({ label, included }) => (
                        <li key={label}>
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
                      ),
                    )}
                  </ul>
                  <Link
                    className="button secondary"
                    href={
                      session.business
                        ? "/launch/account?tab=billing"
                        : `/launch/register${audience === "agency" ? "?kind=agency" : ""}`
                    }
                  >
                    {session.business ? "Review in Billing" : "Register first"}
                  </Link>
                </article>
              ))}
          </div>
        </section>
      ))}
      <p>
        Subscriptions renew monthly until cancelled. Review the total and
        renewal terms in checkout before confirming; manage cancellation in
        Billing. Registration does not create a subscription. Your profile and
        vacancies stay private throughout founding onboarding.
      </p>
    </div>
  );
}
