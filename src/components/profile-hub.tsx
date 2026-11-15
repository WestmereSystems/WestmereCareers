"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  UserRound,
  BriefcaseBusiness,
  Bookmark,
  Bell,
  Search,
  ShieldCheck,
  Settings2,
  ArrowUpRight,
} from "lucide-react";
import { Account, Applications, SavedRoles } from "./candidate-pages";
import { SavedSearches } from "./saved-searches";
import { TrustActivity } from "./trust-workflows";
import { Notifications } from "./notifications";
import { useSession } from "./providers";

const tabs = [
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "applications", label: "Applications", icon: BriefcaseBusiness },
  { id: "saved", label: "Saved roles", icon: Bookmark },
  { id: "alerts", label: "Searches & alerts", icon: Search },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "trust", label: "Trust activity", icon: ShieldCheck },
  { id: "settings", label: "Settings", icon: Settings2 },
] as const;

export function ProfileHub({ source }: { source: "demo" | "live" }) {
  const session = useSession();
  const selected = useSearchParams().get("tab") || "profile";
  const active = tabs.find((tab) => tab.id === selected)?.id || "profile";
  const name = session.user?.fullName?.trim();
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    navigation.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);
  return (
    <main id="main" className="container profile-hub">
      <div className="profile-heading">
        <div className="profile-avatar" aria-hidden="true">
          {name ? (
            name
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0])
              .join("")
          ) : (
            <UserRound size={30} />
          )}
        </div>
        <div>
          <p className="eyebrow">Your own little corner</p>
          <h1>{name || "Your profile."}</h1>
          <p className="muted">
            Your experience, opportunities and updates. All in one place.
          </p>
        </div>
        <div className="profile-heading-actions">
          <span className={session.isPremium ? "badge premium-badge" : "badge"}>
            {session.isPremium ? "Careers+ member" : "Free Westmere account"}
          </span>
          {session.user ? (
            <Link href="/studio" className="text-link">
              Application Studio <ArrowUpRight size={16} />
            </Link>
          ) : (
            <button className="button primary" onClick={session.openAuth}>
              Sign in
            </button>
          )}
        </div>
      </div>
      <nav
        ref={navigation}
        className="profile-tabs"
        aria-label="Profile sections"
      >
        {tabs.map(({ id, label, icon: Icon }) => (
          <Link
            key={id}
            href={id === "profile" ? "/account" : `/account?tab=${id}`}
            scroll={false}
            aria-current={id === active ? "page" : undefined}
          >
            <Icon size={17} aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
      <div
        className="profile-tab-content"
        key={`${session.user?.id ?? "guest"}:${active}`}
      >
        {active === "profile" && <Account />}
        {active === "settings" && <Account section="settings" />}
        {active === "applications" && <Applications />}
        {active === "saved" && <SavedRoles source={source} />}
        {active === "alerts" && (
          <>
            <div className="profile-section-intro">
              <h2>A search worth coming back to.</h2>
              <p className="muted">
                Save your filters. Choose a gentle daily or weekly email when
                new roles match.
              </p>
            </div>
            <SavedSearches />
          </>
        )}
        {active === "notifications" && <Notifications />}
        {active === "trust" && (
          <>
            <div className="profile-section-intro">
              <h2>Your trust activity.</h2>
              <p className="muted">
                Follow private reports, corrections and review outcomes.
              </p>
            </div>
            <TrustActivity />
          </>
        )}
      </div>
    </main>
  );
}
