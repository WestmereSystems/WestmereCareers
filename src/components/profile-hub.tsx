"use client";
import { FoundingAdmin, FoundingContent } from "./founding-controls";

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
  CreditCard,
  ArrowUpRight,
} from "lucide-react";
import { Building2, BarChart3, Compass } from "lucide-react";
import { EmployerInsights } from "./employer-insights";
import { BusinessTypeChanges } from "./business-type-changes";
import { AgencyWorkspace } from "./agency-workspace";
import { BusinessTeam } from "./business-team";
import { EmployerWorkspace } from "./employer-workspace";
import { VerificationIntake } from "./trust-workflows";
import { ModerationWorkspace } from "./moderation-workspace";
import {
  BusinessProfile,
  EmployerDiscovery,
  EmployerNotificationPreferences,
} from "./business-profile";
import { DashboardSkeleton } from "./skeleton";
import { planLabels } from "@/lib/business";
import { Account, Applications, SavedRoles } from "./candidate-pages";
import { SavedSearches } from "./saved-searches";
import { TrustActivity } from "./trust-workflows";
import { CVHistory } from "./profile-tools";
import { Notifications } from "./notifications";
import { AdminActivity } from "./admin-activity";
import { Billing, TestingControls } from "./billing";
import { useSession } from "./providers";
import { PrivacyChoice } from "./privacy-choice";
import { MarketingPreferences } from "./marketing-preferences";
import { MarketingAdministration } from "./marketing-administration";

const candidateTabs = [
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "applications", label: "Applications", icon: BriefcaseBusiness },
  { id: "saved", label: "Saved roles", icon: Bookmark },
  { id: "alerts", label: "Searches & alerts", icon: Search },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "trust", label: "Trust activity", icon: ShieldCheck },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "settings", label: "Settings", icon: Settings2 },
] as const;

export function ProfileHub({ source }: { source: "demo" | "live" }) {
  const session = useSession();
  const business = session.business;
  const tabs: { id: string; label: string; icon: typeof UserRound }[] = business
    ? [
        { id: "profile", label: "Profile", icon: Building2 },
        { id: "roles", label: "Roles", icon: BriefcaseBusiness },
        { id: "launch", label: "Launch preparation", icon: ShieldCheck },
        { id: "applicants", label: "Applicants", icon: UserRound },
        { id: "team", label: "Team", icon: Building2 },
        ...(business.organisations.some(
          (o) => o.kind === "agency" || o.role === "owner",
        )
          ? [{ id: "clients", label: "Clients", icon: Building2 }]
          : []),
        { id: "dashboard", label: "Dashboard", icon: BarChart3 },
        { id: "discovery", label: "Discovery", icon: Compass },
        { id: "notifications", label: "Notifications", icon: Bell },
        { id: "verification", label: "Verification", icon: ShieldCheck },
        { id: "billing", label: "Billing", icon: CreditCard },
        { id: "settings", label: "Settings", icon: Settings2 },
      ]
    : [...candidateTabs];
  if (session.staffRole)
    tabs.push({ id: "admin", label: "Admin", icon: ShieldCheck });
  const selected = useSearchParams().get("tab") || "profile";
  const active = tabs.find((tab) => tab.id === selected)?.id || "profile";
  const name = business?.tradingName || session.user?.fullName?.trim();
  const profileOrganisation =
    business?.organisations.find((org) => org.name === business.tradingName) ||
    business?.organisations[0];
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    navigation.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);
  if (session.loading)
    return (
      <main id="main" className="container profile-hub">
        <DashboardSkeleton />
      </main>
    );
  return (
    <main id="main" className="container profile-hub">
      <div className="profile-heading">
        <div className="profile-avatar" aria-hidden="true">
          {profileOrganisation?.avatarPath && profileOrganisation.verified ? (
            <img
              src={`/api/employer-image?id=${profileOrganisation.id}&kind=avatar&v=${encodeURIComponent(profileOrganisation.avatarPath)}`}
              alt=""
              width={80}
              height={80}
            />
          ) : name ? (
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
          <p className="eyebrow">
            {business
              ? "Your business. Your next chapter."
              : "Your own little corner"}
          </p>
          <h1>{name || "Your profile."}</h1>
          <p className="muted">
            {business
              ? "Your company, hiring activity and candidate connections. All in one place."
              : "Your experience, opportunities and updates. All in one place."}
          </p>
        </div>
        <div className="profile-heading-actions">
          <span className={session.isPremium ? "badge premium-badge" : "badge"}>
            {session.testingAccess ? "Testing · " : ""}
            {business
              ? business.tier
                ? `${planLabels[business.tier]} · ${business.kind === "agency" ? "Agency account" : "Business account"}`
                : "Business account · No active plan"
              : session.isPremium
                ? "Careers+ member"
                : "Free Westmere account"}
          </span>
          {session.user && (!business || session.isPremium) ? (
            <Link href="/studio" className="text-link">
              Careers+ Studio <ArrowUpRight size={16} />
            </Link>
          ) : !session.user ? (
            <button className="button primary" onClick={session.openAuth}>
              {session.marketplaceOpen
                ? "Sign in"
                : "Applicant accounts open at launch"}
            </button>
          ) : null}
        </div>
      </div>
      {business?.needsOnboarding && (
        <div className="verification-banner">
          <ShieldCheck size={22} />
          <div>
            <strong>Complete your business account.</strong>
            <p>
              Confirm your trading name and accept the current business Terms to
              use your hiring tools.
            </p>
          </div>
          <Link href="/employers/sign-in" className="button secondary small">
            Complete setup
          </Link>
        </div>
      )}
      {business && !business.needsOnboarding && !business.verified && (
        <div className="verification-banner">
          <ShieldCheck size={22} />
          <div>
            <strong>
              {business.pending
                ? "Your business is awaiting review."
                : "Verify your business to start hiring."}
            </strong>
            <p>
              {business.pending
                ? "We aim to review a complete submission within 48 hours. We may request more information; hiring access remains restricted until approval."
                : "Confirm your business identity and authority before publishing roles or accessing candidate applications."}
            </p>
          </div>
          <Link
            href="/account?tab=verification"
            className="button secondary small"
          >
            {business.pending ? "View request" : "Verify business"}
          </Link>
        </div>
      )}
      {business && !session.marketplaceOpen && (
        <div className="founding-access-note">
          <strong>Your founding workspace is private.</strong>
          <p>
            Your business details and vacancies are not public during founding
            onboarding. After verification, prepare them and record permission
            in Launch preparation. Only Westmere can release approved content
            after the public marketplace opens. Subscribing does not publish
            your content.
          </p>
        </div>
      )}
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
        {active === "profile" &&
          (business ? (
            <>
              <BusinessProfile />
              {session.isPremium && (
                <>
                  <p className="notice">
                    Your Careers+ base CV is private to this billing account and
                    supports the candidate tools included with Enterprise.
                  </p>
                  <CVHistory onSelect={() => {}} />
                </>
              )}
            </>
          ) : (
            <Account />
          ))}
        {active === "launch" && business && <FoundingContent />}
        {active === "dashboard" && business && <EmployerInsights />}
        {active === "roles" && business && <EmployerWorkspace />}
        {active === "applicants" && business && (
          <EmployerWorkspace view="applicants" />
        )}
        {active === "team" && session.user && <BusinessTeam />}
        {active === "clients" && business && <AgencyWorkspace />}
        {active === "discovery" && business && <EmployerDiscovery />}
        {active === "verification" && business && <VerificationIntake />}
        {active === "admin" && session.staffRole && (
          <>
            <div className="panel">
              <h2>Your private admin workspace.</h2>
              <p>
                Signed in as <strong>{session.user?.email}</strong> ·{" "}
                {session.staffRole}. Access is checked on the server.
              </p>
            </div>
            <FoundingAdmin />
            <MarketingAdministration />
            <ModerationWorkspace />
            <TestingControls />
            <AdminActivity />
            <AgencyWorkspace review />
            <BusinessTypeChanges review />
          </>
        )}
        {active === "billing" && <Billing />}
        {active === "settings" && (
          <>
            <Account section="settings" />
            <MarketingPreferences />
            <PrivacyChoice inline />
            {business && <BusinessTypeChanges />}
          </>
        )}
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
        {active === "notifications" && (
          <>
            {business && <EmployerNotificationPreferences />}
            <Notifications />
          </>
        )}
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
