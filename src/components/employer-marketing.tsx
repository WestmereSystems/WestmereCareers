"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  BarChart3,
  Eye,
  Users,
  Search,
  Building2,
  Sparkles,
} from "lucide-react";
import { useSession } from "./providers";
import { AustraliaDiscovery } from "./australia-discovery";
export function EmployerMarketing() {
  const session = useSession(),
    router = useRouter();
  const [agency, setAgency] = useState(false);
  useEffect(() => {
    if (session.user && session.business)
      router.replace("/account?tab=dashboard");
  }, [session.user, session.business, router]);
  const start = session.business
    ? "/account?tab=billing"
    : `/employers/sign-in${agency ? "?kind=agency" : ""}`;
  const plans = agency
    ? [
        {
          name: "Agency Starter",
          price: "A$199",
          suffix: "/month",
          description: "A clear foundation for your recruitment desk.",
          features: [
            "Verified agency profile",
            "Role and application management",
            "Hiring activity dashboard",
            "Configurable team reminders",
          ],
        },
        {
          name: "Agency Growth",
          price: "A$399",
          suffix: "/month",
          description: "Understand your reach as your client portfolio grows.",
          features: [
            "Everything in Agency Starter",
            "Discovery analytics",
            "Search keyword insights",
            "Regional audience overview",
          ],
          featured: true,
        },
        {
          name: "Agency Enterprise",
          price: "A$799",
          suffix: "/month",
          description: "An agreed service for your recruitment operation.",
          features: [
            "Everything in Agency Growth",
            "Multiple authorised organisations",
            "Organisation and role filters",
            "Sandbox access to current hiring tools",
          ],
        },
      ]
    : [
        {
          name: "Starter",
          price: "A$129",
          suffix: "/month",
          description: "Bring clarity to your next hire.",
          features: [
            "Verified company profile",
            "Role and application management",
            "Hiring activity dashboard",
            "Configurable team reminders",
          ],
        },
        {
          name: "Growth",
          price: "A$249",
          suffix: "/month",
          description: "Make your next chapter a bigger one.",
          features: [
            "Everything in Starter",
            "Discovery analytics",
            "Search keyword insights",
            "Regional audience overview",
          ],
          featured: true,
        },
        {
          name: "Enterprise",
          price: "A$499",
          suffix: "/month",
          description: "A considered fit for established hiring teams.",
          features: [
            "Everything in Growth",
            "Multiple authorised organisations",
            "Organisation and role filters",
            "Sandbox access to current hiring tools",
          ],
        },
      ];
  return (
    <>
      <section className="employer-hero">
        <div>
          <p className="eyebrow">Good teams start with good people</p>
          <h1>
            Find your people.
            <br />
            <span className="accent">Build your next chapter.</span>
          </h1>
          <p>
            Bring your opportunity to a more thoughtful Australian job market.
            Clear roles, useful applications, and a human approach to hiring.
          </p>
          <ul className="check-list">
            <li>
              <Check />
              Salary clarity from the first impression.
            </li>
            <li>
              <Check />A simple workspace for reviewing applications.
            </li>
            <li>
              <Check />
              Candidate communication built into the process.
            </li>
          </ul>
          <div className="hero-actions">
            <Link className="button primary" href={start}>
              Get started <ArrowRight size={17} />
            </Link>
            <a href="#plans" className="text-link">
              Explore plans
            </a>
          </div>
        </div>
        <figure className="employer-hero-photo">
          <img
            src="/images/creative-colleagues.webp"
            alt="Colleagues bringing their experience together at work"
            width={1260}
            height={709}
          />
          <figcaption>Good hiring feels human.</figcaption>
        </figure>
      </section>
      <section className="employer-insight-promo dot-surface">
        <div>
          <p className="eyebrow">A clearer view of your hiring</p>
          <h2>Your next great hire starts with insight.</h2>
          <p className="muted">
            Follow application activity, see how your roles are performing and
            give every candidate a clearer next step. Your private hiring
            dashboard brings it together.
          </p>
          <Link href="/employers/preview" className="button secondary">
            Preview Dashboard <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="mini-dashboard" aria-hidden="true">
          <div className="mini-nav">
            <span className="live-dot" />
            Your hiring, in focus <span>•••</span>
          </div>
          <div className="mini-metrics">
            {[
              [Users, "Applications", "128"],
              [Eye, "Opened by team", "94"],
              [Building2, "Open roles", "6"],
            ].map(([I, l, n], i) => {
              const Icon = I as typeof Users;
              return (
                <div key={i}>
                  <Icon size={17} />
                  <strong>{String(n)}</strong>
                  <small>{String(l)}</small>
                </div>
              );
            })}
          </div>
          <div className="mini-chart">
            {[26, 39, 32, 54, 48, 68, 60, 82, 70, 96, 87, 112].map((h, i) => (
              <span
                key={i}
                style={{ height: h, animationDelay: `${i * 0.12}s` }}
              />
            ))}
          </div>
          <div className="mini-row">
            <span className="live-dot" />A clearer next step for every
            application
          </div>
          <p className="fineprint">Illustrative dashboard</p>
        </div>
      </section>
      <section id="plans" className="employer-pricing">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Room for your next chapter</p>
            <h2>Good hiring. A plan that fits.</h2>
          </div>
          <div
            className="pricing-switch"
            role="group"
            aria-label="Business structure"
          >
            <button aria-pressed={!agency} onClick={() => setAgency(false)}>
              I’m an Employer
            </button>
            <button aria-pressed={agency} onClick={() => setAgency(true)}>
              I’m an Agency
            </button>
          </div>
        </div>
        <p className="notice">
          Sandbox-only monthly test prices. No real money is charged. These are
          not approved live offers. GST collection is disabled.
        </p>
        <div className="business-plan-grid">
          {plans.map((p) => (
            <article
              key={p.name}
              className={`business-plan ${p.featured ? "featured-plan" : ""}`}
            >
              {p.featured && (
                <div className="plan-ribbon">
                  <Sparkles size={15} />
                  Built for growing {agency ? "agencies" : "businesses"}
                </div>
              )}
              <h3>{p.name}</h3>
              <p className="plan-price">
                {p.price}
                {"suffix" in p && <small>{p.suffix}</small>}
              </p>
              <p className="muted">{p.description}</p>
              <ul>
                {p.features.map((f) => (
                  <li key={f}>
                    <Check size={17} />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={start}
                className={`button ${p.featured ? "primary" : "secondary"}`}
              >
                Get Started <ArrowRight size={16} />
              </Link>
            </article>
          ))}
        </div>
        <p className="fineprint">
          Prices in Australian dollars, including any applicable GST. Sandbox
          subscriptions use a separately confirmed checkout. Live business
          services require an accepted order. Listing allowances, duration,
          service scope and any additional charges are confirmed before
          purchase. Signing in does not start a paid plan. We give at least 30
          days’ notice of renewal price increases.
        </p>
        <div className="ad-prices">
          <div>
            <p className="eyebrow">One opportunity at a time</p>
            <h3>Prefer an individual advertisement?</h3>
            <p className="muted">
              Choose what suits this hire. Publication requires verified hiring
              authority. Listings publish directly and notify our moderation
              team.
            </p>
          </div>
          <div>
            <span>Standard advertisement</span>
            <strong>A$75</strong>
            <small>per advertisement</small>
          </div>
          <div>
            <span>Featured advertisement</span>
            <strong>A$120</strong>
            <small>per advertisement · placement subject to order</small>
          </div>
          <Link className="button secondary" href={start}>
            Get started <ArrowRight size={17} />
          </Link>
        </div>
        <p className="fineprint">
          Featured placement is identified when available. It does not guarantee
          impressions, applications or a hiring outcome. Duration and placement
          are agreed in your order before payment.
        </p>
      </section>
      <section className="employer-discovery-promo dot-surface">
        <div>
          <span className="badge">Growth & above</span>
          <p className="eyebrow">See where possibility begins</p>
          <h2>
            Meet your next audience.
            <br />
            <span className="accent">Across Australia.</span>
          </h2>
          <p className="muted">
            See recorded search appearances, listing and company-profile views,
            recognised search keywords and broad visitor regions. Turn attention
            into a more thoughtful hiring strategy.
          </p>
          <ul className="check-list">
            <li>
              <Search />
              Understand how your roles are discovered
            </li>
            <li>
              <BarChart3 />
              Compare the reach of your opportunities
            </li>
            <li>
              <Eye />
              Privacy-conscious, aggregated reporting
            </li>
          </ul>
          <Link href="/employers/preview?tab=discovery" className="text-link">
            Explore Discovery <ArrowUpRight size={17} />
          </Link>
        </div>
        <AustraliaDiscovery demo />
      </section>
      <section className="employer-last-call panel">
        <div>
          <p className="eyebrow">The next chapter starts with a conversation</p>
          <h2>Your people are out there.</h2>
          <p className="muted">
            Let’s give them a clearer picture of what’s possible.
          </p>
        </div>
        <Link className="button primary" href={start}>
          Get started <ArrowRight size={18} />
        </Link>
      </section>
    </>
  );
}
