"use client";
import { launchPath } from "@/lib/launch-paths";
import { PrivacyChoice } from "./privacy-choice";
import { AdvertisingMeasurement } from "./advertising-measurement";
import { AustraliaIcon } from "@/components/australia-icon";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  ArrowRight,
  Menu,
  X,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { ThemeToggle, useSession } from "./providers";
import { NotificationPreview } from "./notifications";

export function Brand() {
  const session = useSession();
  return (
    <Link
      href={launchPath("/", session.marketplaceOpen)}
      className="brand"
      aria-label="Westmere Careers home"
    >
      <span className="brand-mark" aria-hidden="true">
        w
      </span>
      <span>
        westmere<span className="brand-careers">CAREERS</span>
      </span>
    </Link>
  );
}
export function Header() {
  const rawPathname = usePathname();
  const pathname = rawPathname
    .replace(/^\/launch\/preview$/, "/companies")
    .replace(/^\/launch(?=\/|$)/, "");
  const session = useSession();
  const [menu, setMenu] = useState(false);
  const hasStudio = Boolean(session.user && session.isPremium);
  return (
    <header className="site-header">
      <div className="header-inner">
        <Brand />
        <nav
          className={menu ? "main-nav open" : "main-nav"}
          aria-label="Main navigation"
        >
          <Link
            href={
              session.marketplaceOpen ? "/jobs" : "/launch#candidate-updates"
            }
            aria-current={pathname.startsWith("/jobs") ? "page" : undefined}
            className={pathname.startsWith("/jobs") ? "active" : ""}
            onClick={() => setMenu(false)}
          >
            {session.marketplaceOpen ? "Find a job" : "For job seekers"}
          </Link>
          <Link
            href={session.marketplaceOpen ? "/companies" : "/launch/employers"}
            aria-current={
              pathname.startsWith("/companies") ? "page" : undefined
            }
            className={pathname.startsWith("/companies") ? "active" : ""}
            onClick={() => setMenu(false)}
          >
            {session.marketplaceOpen
              ? "Explore employers"
              : "Employer onboarding"}
          </Link>
          <Link
            href={
              hasStudio
                ? "/studio"
                : launchPath("/careers-plus", session.marketplaceOpen)
            }
            aria-current={
              pathname === "/careers-plus" || pathname === "/studio"
                ? "page"
                : undefined
            }
            className={`premium-link ${pathname === "/careers-plus" || pathname === "/studio" ? "active" : ""}`}
            onClick={() => setMenu(false)}
          >
            Careers<span>+</span>
            {hasStudio && " Studio"}
          </Link>
          <Link
            href={launchPath(
              session.business ? "/account?tab=dashboard" : "/employers",
              session.marketplaceOpen,
            )}
            aria-current={
              pathname.startsWith("/employers") ? "page" : undefined
            }
            className={pathname.startsWith("/employers") ? "active" : ""}
            onClick={() => setMenu(false)}
          >
            For employers
            <ArrowUpRight size={13} />
          </Link>
        </nav>
        <div className="header-actions">
          <ThemeToggle />
          {session.loading ? (
            <span className="session-placeholder" role="status">
              Checking account…
            </span>
          ) : session.user ? (
            <>
              <span
                className="header-greeting"
                title={
                  session.business?.tradingName
                    ? `Hello, ${session.business.tradingName}`
                    : undefined
                }
              >
                Hello,{" "}
                {session.business?.tradingName ||
                  session.user.fullName?.trim().split(/\s+/)[0] ||
                  "there"}
              </span>
              <NotificationPreview />
              <Link
                href={launchPath("/account", session.marketplaceOpen)}
                className="button small secondary"
              >
                <UserRound size={17} aria-hidden="true" />
                Profile
              </Link>
            </>
          ) : !session.marketplaceOpen ? (
            <Link href="/launch/sign-in" className="button small secondary">
              Sign in
            </Link>
          ) : (
            <button
              className="button small secondary"
              onClick={session.openAuth}
            >
              Sign in
              <ArrowRight size={15} />
            </button>
          )}
          <button
            className="icon-button mobile-menu"
            onClick={() => setMenu(!menu)}
            aria-label={menu ? "Close navigation" : "Open navigation"}
            aria-expanded={menu}
          >
            {menu ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
    </header>
  );
}
export function Footer() {
  const session = useSession();
  const hasStudio = Boolean(session.user && session.isPremium);
  const accountLink = (tab: string) =>
    launchPath(`/account?tab=${tab}`, session.marketplaceOpen);
  const nextStep = {
    label: session.marketplaceOpen ? "Find a job" : "Get a launch update",
    href: session.marketplaceOpen ? "/jobs" : "/launch#candidate-updates",
  };
  const workspaceLinks = session.business
    ? [
        { label: "Business profiles", href: accountLink("profile") },
        { label: "Manage roles", href: accountLink("roles") },
        ...(!session.marketplaceOpen
          ? [{ label: "Launch preparation", href: accountLink("launch") }]
          : []),
        { label: "Applicants", href: accountLink("applicants") },
        { label: "Hiring dashboard", href: accountLink("dashboard") },
      ]
    : session.user
      ? [
          nextStep,
          { label: "My profile", href: accountLink("profile") },
          { label: "My applications", href: accountLink("applications") },
          { label: "Saved roles", href: accountLink("saved") },
          { label: "Searches and alerts", href: accountLink("alerts") },
          { label: "My trust activity", href: accountLink("trust") },
        ]
      : session.marketplaceOpen
        ? [
            nextStep,
            { label: "Explore employers", href: "/companies" },
            { label: "Saved roles", href: "/saved" },
            { label: "Sign in or create an account", href: "/account" },
          ]
        : [
            nextStep,
            { label: "Register your business", href: "/launch/register" },
            { label: "Business sign in", href: "/launch/sign-in" },
          ];
  return (
    <footer className="site-footer">
      <div className="container footer-top">
        <div>
          <Brand />
          <PrivacyChoice />
          <AdvertisingMeasurement />
          <p>
            A little clarity.
            <br />A world of possibility.
          </p>
          <span className="footer-note">
            <AustraliaIcon />
            Made for the Australian working world.
          </span>
        </div>
        <div className="footer-links">
          <div>
            <h3>
              {session.business
                ? "Your business"
                : session.user
                  ? "Your account"
                  : "Get started"}
            </h3>
            {workspaceLinks.map(({ label, href }) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
            {hasStudio && <Link href="/studio">Careers+ Studio</Link>}
          </div>
          <div>
            <h3>Explore Westmere</h3>
            <Link href={launchPath("/employers", session.marketplaceOpen)}>
              {session.marketplaceOpen
                ? "For employers"
                : "Employer onboarding"}
            </Link>
            <Link
              href={
                session.marketplaceOpen ? "/employers#plans" : "/launch/plans"
              }
            >
              Employer and agency plans
            </Link>
            {!hasStudio && (
              <Link href={launchPath("/careers-plus", session.marketplaceOpen)}>
                Careers+
              </Link>
            )}
            <Link href="/about">About Westmere</Link>
            <a
              href="https://www.linkedin.com/company/westmerecareers"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Westmere Careers on LinkedIn (opens in a new tab)"
            >
              LinkedIn
            </a>
            <a href="mailto:hello@westmere.com.au">Contact Westmere</a>
            <StaffLink />
          </div>
        </div>
        <div className="footer-flower" aria-hidden="true">
          <img
            src="/illustrations/career-path.svg"
            alt=""
            width="115"
            height="120"
          />
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} Westmere Careers</span>
        <div>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/transparency">Transparency</Link>
        </div>
        <span className="footer-signoff">
          Your career starts with Westmere.
        </span>
      </div>
    </footer>
  );
}
export function EmptyState({
  title,
  description,
  action,
  href,
}: {
  title: string;
  description: string;
  action?: string;
  href?: string;
}) {
  return (
    <div className="empty-state">
      <span className="round-icon">
        <Sparkles size={25} />
      </span>
      <h2>{title}</h2>
      <p className="muted">{description}</p>
      {action && href && (
        <Link className="button primary" href={href}>
          {action}
          <ArrowRight size={16} />
        </Link>
      )}
    </div>
  );
}

function StaffLink() {
  const session = useSession();
  return session.staffRole ? (
    <Link href={launchPath("/account?tab=admin", session.marketplaceOpen)}>
      Admin workspace
    </Link>
  ) : null;
}
