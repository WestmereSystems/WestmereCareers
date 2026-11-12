"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  ArrowRight,
  Menu,
  X,
  Sparkles,
  Leaf,
} from "lucide-react";
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
            className={pathname.startsWith("/jobs") ? "active" : ""}
            onClick={() => setMenu(false)}
          >
            Find a job
          </Link>
          <Link
            href="/companies"
            className={pathname.startsWith("/companies") ? "active" : ""}
            onClick={() => setMenu(false)}
          >
            Explore employers
          </Link>
          <Link
            href="/careers-plus"
            className={`premium-link ${pathname === "/careers-plus" ? "active" : ""}`}
            onClick={() => setMenu(false)}
          >
            Careers<span>+</span>
          </Link>
          <Link
            href="/employers"
            className={pathname === "/employers" ? "active" : ""}
            onClick={() => setMenu(false)}
          >
            For employers
            <ArrowUpRight size={13} />
          </Link>
        </nav>
        <div className="header-actions">
          <ThemeToggle />
          {session.user ? (
            <Link href="/account" className="button small secondary">
              My account
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
            <Leaf size={14} />
            Made for the Australian working world.
          </span>
        </div>
        <div className="footer-links">
          <div>
            <h3>Your next step</h3>
            <Link href="/jobs">Find a job</Link>
            <Link href="/saved">Saved roles</Link>
            <Link href="/applications">My applications</Link>
            <Link href="/studio">Application Studio</Link>
          </div>
          <div>
            <h3>A better experience</h3>
            <Link href="/employers">For employers</Link>
            <Link href="/careers-plus">Careers+</Link>
            <Link href="/transparency">Our transparency promise</Link>
            <Link href="/privacy">Your privacy</Link>
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
