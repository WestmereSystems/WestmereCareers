"use client";
import { AustraliaIcon } from "@/components/australia-icon";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, ArrowRight, Menu, X, Sparkles } from "lucide-react";
import { useState } from "react";
import { ThemeToggle, useSession } from "./providers";

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Westmere Careers home">
      <span className="brand-mark" aria-hidden="true">
        w<span />
      </span>
      <span>
        westmere<span className="brand-careers">careers</span>
      </span>
    </Link>
  );
}
export function Header() {
  const pathname = usePathname();
  const session = useSession();
  const [menu, setMenu] = useState(false);
  return (
    <header className="site-header">
      <div className="header-inner">
        <Brand />
        <nav
          className={menu ? "main-nav open" : "main-nav"}
          aria-label="Main navigation"
        >
          <Link
            href="/jobs"
            aria-current={pathname.startsWith("/jobs") ? "page" : undefined}
            className={pathname.startsWith("/jobs") ? "active" : ""}
            onClick={() => setMenu(false)}
          >
            Find a job
          </Link>
          <Link
            href="/companies"
            aria-current={
              pathname.startsWith("/companies") ? "page" : undefined
            }
            className={pathname.startsWith("/companies") ? "active" : ""}
            onClick={() => setMenu(false)}
          >
            Explore employers
          </Link>
          <Link
            href="/careers-plus"
            aria-current={pathname === "/careers-plus" ? "page" : undefined}
            className={`premium-link ${pathname === "/careers-plus" ? "active" : ""}`}
            onClick={() => setMenu(false)}
          >
            Careers<span>+</span>
          </Link>
          <Link
            href="/employers"
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
              <span className="header-greeting">
                Hello,{" "}
                {session.user.fullName?.trim().split(/\s+/)[0] || "there"}
              </span>
              <Link
                href="/notifications"
                className="header-notifications"
                aria-label="Notifications"
              >
                Updates
              </Link>
              <Link href="/account" className="button small secondary">
                My profile
              </Link>
            </>
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
  return (
    <footer className="site-footer">
      <div className="container footer-top">
        <div>
          <Brand />
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
            <h3>Your next step</h3>
            <Link href="/jobs">Find a job</Link>
            <Link href="/saved">Saved roles</Link>
            <Link href="/saved-searches">Saved searches & alerts</Link>
            <Link href="/trust-activity">My trust activity</Link>
            <Link href="/applications">My applications</Link>
            <Link href="/studio">Application Studio</Link>
          </div>
          <div>
            <h3>A better experience</h3>
            <Link href="/employers">For employers</Link>
            <Link href="/careers-plus">Careers+</Link>
            <Link href="/about">About Westmere</Link>
            <Link href="/transparency">Our transparency promise</Link>
            <Link href="/privacy">Your privacy</Link>
            <StaffLink />
          </div>
        </div>
        <div className="footer-flower" aria-hidden="true">
          <img
            src="/illustrations/growing-together.svg"
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
          <Link href="/transparency">How response insights work</Link>
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
    <Link href="/admin">Trust review workspace</Link>
  ) : null;
}
