"use client";
import { companyPath } from "@/lib/company-urls";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Building2,
  Globe,
  Link2,
  Camera,
  UsersRound,
  Compass,
  Check,
  Star,
} from "lucide-react";
import { useSession } from "./providers";
import { useNotifications } from "./notifications";
import { DashboardSkeleton } from "./skeleton";
import { EmployerBranding } from "./employer-branding";
import { AustraliaDiscovery, DiscoveryTables } from "./australia-discovery";
import { hasDiscovery, planLabels } from "@/lib/business";
import { ConfirmAction } from "./confirm-action";
import { sendJson } from "./trust-workflows";
import type { BusinessPlanCoverage } from "@/lib/business-plan";
import type { BusinessRegistrationCapacity } from "@/lib/business-registration";
export const socialIcons = {
  website: Globe,
  linkedin: Link2,
  instagram: Camera,
  facebook: UsersRound,
};
export function BusinessLinks({
  website,
  links = {},
}: {
  website?: string | null;
  links?: Record<string, string>;
}) {
  return (
    <div className="business-socials">
      {Object.entries({ website, ...links })
        .filter(([, v]) => v)
        .map(([k, v]) => {
          const Icon = socialIcons[k as keyof typeof socialIcons] || Globe;
          return (
            <a
              key={k}
              href={v!}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={k}
            >
              <Icon size={19} />
              <span>
                {k === "website" ? "Website" : k[0].toUpperCase() + k.slice(1)}
              </span>
            </a>
          );
        })}
    </div>
  );
}
export function BusinessProfile() {
  const session = useSession();
  const notifications = useNotifications();
  type Org = {
    id: string;
    name: string;
    description: string;
    website: string | null;
    careers_email: string | null;
    avatar_path: string | null;
    banner_path: string | null;
    social_links: Record<string, string>;
    is_verified: boolean;
    is_test?: boolean;
    suspended_at: string | null;
  };
  const [members, setMembers] = useState<
    { role: string; organisations: Org }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const [removing, setRemoving] = useState<Org | null>(null);
  const [coverage, setCoverage] = useState<BusinessPlanCoverage | null>(null);
  const [registrationCapacity, setRegistrationCapacity] =
    useState<BusinessRegistrationCapacity | null>(null);
  const [coveredIds, setCoveredIds] = useState<string[]>([]);
  const [savingCoverage, setSavingCoverage] = useState(false);
  const [defaultBusy, setDefaultBusy] = useState("");
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    Promise.all(
      ["/api/employers", "/api/employers/plan"].map(async (url) => {
        const r = await fetch(url, { signal: c.signal, cache: "no-store" });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        return d;
      }),
    )
      .then(([workspace, billing]) => {
        if (c.signal.aborted) return;
        setMembers(workspace.memberships || []);
        setCoverage(billing.plan);
        setRegistrationCapacity(billing.registrationCapacity || null);
        setCoveredIds(
          billing.plan.organisations
            .filter(
              (o: BusinessPlanCoverage["organisations"][number]) =>
                o.associated && o.billingOwnerId === session.user?.id,
            )
            .map((o: { id: string }) => o.id),
        );
      })
      .catch((e) => {
        if (!c.signal.aborted) setMessage(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [session.user?.id, revision]);
  if (loading) return <DashboardSkeleton />;
  return (
    <>
      <div className="profile-section-intro">
        <p className="eyebrow">Tell your company’s story</p>
        <h2>
          {session.business?.kind === "agency"
            ? "Your agency profile."
            : "Your company profile."}
        </h2>
        <p className="muted">
          Introduce your business, the people behind it and the opportunities
          ahead.
        </p>
        {registrationCapacity?.canSubmit ? (
          <Link
            href="/account?tab=verification&newBusiness=1#new-business"
            className="button secondary"
          >
            <Building2 size={17} /> Add another business
          </Link>
        ) : (
          <Link href="/account?tab=verification" className="button secondary">
            {registrationCapacity
              ? "Review your business allowance"
              : "Check business allowance"}
          </Link>
        )}
      </div>
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
      {coverage && members.some((m) => m.role === "owner") && (
        <section
          className="panel business-plan-coverage"
          aria-labelledby="business-coverage-title"
        >
          <h3 id="business-coverage-title">Businesses on your plan</h3>
          <p>
            {coverage.tier ? planLabels[coverage.tier] : "Free account"} ·{" "}
            {coveredIds.length} of {coverage.limit} business places selected.
          </p>
          <p className="fineprint">
            Billing owner: {coverage.billingOwnerEmail} (your account). One plan
            covers your selected businesses. Starter includes 1, Growth 3, and
            Enterprise 10. Each business is verified independently.
          </p>
          <div className="form-stack">
            {members
              .filter((m) => m.role === "owner")
              .map(({ organisations: o }) => (
                <label className="checkbox-label" key={o.id}>
                  <input
                    type="checkbox"
                    checked={coveredIds.includes(o.id)}
                    disabled={savingCoverage}
                    onChange={(event) =>
                      setCoveredIds((ids) =>
                        event.target.checked
                          ? [...ids, o.id]
                          : ids.filter((id) => id !== o.id),
                      )
                    }
                  />
                  {o.name}
                </label>
              ))}
          </div>
          {coveredIds.length > coverage.limit && (
            <p className="message" role="status">
              Select up to {coverage.limit} businesses, or review your plan in
              Billing.
            </p>
          )}
          <div className="actions-row">
            <button
              type="button"
              className="button primary"
              disabled={savingCoverage || coveredIds.length > coverage.limit}
              onClick={async () => {
                setSavingCoverage(true);
                try {
                  const d = await sendJson("/api/employers/plan", {
                    organisationIds: coveredIds,
                  });
                  setCoverage(d.plan);
                  setMessage(d.message);
                  await session.refresh();
                } catch (error) {
                  setMessage(
                    error instanceof Error
                      ? error.message
                      : "Business coverage could not be saved.",
                  );
                } finally {
                  setSavingCoverage(false);
                }
              }}
            >
              {savingCoverage ? "Saving coverage…" : "Save business coverage"}
            </button>
            <Link href="/account?tab=billing" className="button secondary">
              Review billing plan
            </Link>
          </div>
          <p className="fineprint">
            Businesses you manage by invitation use their owner’s plan and do
            not use your business places. Removing coverage turns off paid
            features for that business and its invited team.
          </p>
        </section>
      )}
      {members.length === 0 ? (
        <div className="panel">
          <Building2 />
          <h3>{session.business?.tradingName}</h3>
          <p className="muted">
            Complete business verification to activate your public company
            profile, images and hiring tools.
          </p>
          <Link href="/account?tab=verification" className="button primary">
            Verify your business
          </Link>
        </div>
      ) : (
        members.map(({ role, organisations: o }) => (
          <section className="panel business-profile-card" key={o.id}>
            {o.banner_path ? (
              <img
                className="employer-banner"
                src={`/api/employer-image?id=${o.id}&kind=banner&v=${encodeURIComponent(o.banner_path)}`}
                alt=""
                width={1200}
                height={400}
              />
            ) : (
              <div className="business-banner-placeholder dot-surface" />
            )}
            <div className="business-profile-title">
              {o.avatar_path ? (
                <img
                  src={`/api/employer-image?id=${o.id}&kind=avatar&v=${encodeURIComponent(o.avatar_path)}`}
                  alt=""
                  width={80}
                  height={80}
                />
              ) : (
                <span className="company-monogram">{o.name[0]}</span>
              )}
              <div>
                <h3>{o.name}</h3>
                <span className="badge">
                  {o.is_test
                    ? "Fictional test company"
                    : o.is_verified && !o.suspended_at
                      ? "Business verified"
                      : "Verification pending"}
                </span>
              </div>
              <div className="business-profile-actions">
                <button
                  type="button"
                  className="button secondary small"
                  disabled={
                    !!defaultBusy ||
                    !o.is_verified ||
                    !!o.suspended_at ||
                    session.business?.defaultOrganisationId === o.id
                  }
                  onClick={async () => {
                    setDefaultBusy(o.id);
                    try {
                      const result = await sendJson(
                        "/api/employers/default-business",
                        { organisationId: o.id },
                      );
                      setMessage(result.message);
                      await session.refresh();
                    } catch (error) {
                      setMessage(
                        error instanceof Error
                          ? error.message
                          : "Your default business could not be saved.",
                      );
                    } finally {
                      setDefaultBusy("");
                    }
                  }}
                >
                  <Star size={16} />
                  {session.business?.defaultOrganisationId === o.id
                    ? "Default business"
                    : defaultBusy === o.id
                      ? "Saving…"
                      : "Use as default"}
                </button>
                <Link href={companyPath(o.name, o.id)} className="text-link">
                  View public profile →
                </Link>
              </div>
            </div>
            {(() => {
              const billing = coverage?.organisations.find(
                (item) => item.id === o.id,
              );
              return (
                billing && (
                  <div className="notice business-billing-label">
                    <strong>
                      {billing.covered
                        ? `${planLabels[billing.tier || ""] || "Paid plan"} · included in active plan`
                        : "No active paid plan coverage"}
                    </strong>
                    <p>
                      Billing owner:{" "}
                      {billing.billingOwnerEmail || "Business owner"}
                      {billing.billingOwnerId === session.user?.id
                        ? " (your account)"
                        : " (business owner’s account)"}
                      .
                    </p>
                    {role !== "owner" && (
                      <p>
                        Your access is through an invitation. This business uses
                        its owner’s billing stream.
                      </p>
                    )}
                    {!billing.covered && (
                      <p>
                        {billing.associated
                          ? "Selected for this billing stream; paid features require an active plan with enough business places."
                          : "Not associated with an active billing stream. The owner can select this business in plan coverage."}
                      </p>
                    )}
                  </div>
                )
              );
            })()}
            <p className="company-description">
              {o.description ||
                "Add a company introduction, your values, workplace and the kind of talent you’re looking for."}
            </p>
            <BusinessLinks website={o.website} links={o.social_links} />
            {["owner", "admin"].includes(role) &&
              o.is_verified &&
              !o.suspended_at && (
                <EmployerBranding
                  organisation={o}
                  onSaved={() => setRevision((n) => n + 1)}
                />
              )}
            {role === "owner" && (
              <div className="danger-zone">
                <h4>Remove this company</h4>
                <p>
                  Remove the public company profile and archive every listing
                  under it. This closes hiring access for the whole company.
                </p>
                <button
                  className="button danger"
                  onClick={() => setRemoving(o)}
                >
                  Remove company
                </button>
              </div>
            )}
          </section>
        ))
      )}
      {removing && (
        <ConfirmAction
          title={`Remove ${removing.name}?`}
          businessName={removing.name}
          confirmLabel="Remove company and archive listings"
          danger
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            const d = await sendJson(
              "/api/employers/company",
              { organisationId: removing.id, businessName: removing.name },
              "DELETE",
            );
            setMessage(d.message);
            setRevision((n) => n + 1);
            await Promise.all([session.refresh(), notifications.refresh()]);
          }}
        >
          <p>
            This action removes the company from Westmere’s public service. You
            will lose:
          </p>
          <ul>
            <li>
              All current public job listings under this company. They will be
              archived and stop accepting applications.
            </li>
            <li>The company’s public profile, branding and public links.</li>
            <li>
              Discovery appearances, search visibility and access to Discovery
              features.
            </li>
            <li>
              Your team’s hiring access to this company’s candidate applications
              and documents.
            </li>
          </ul>
          <p>
            Existing application snapshots, statistics and audit records are
            retained under the Privacy Policy. They are not erased by removing
            the company. Cancel any paid subscription in Billing and wait until
            it has ended before proceeding. Reinstatement requires support and a
            new verification review.
          </p>
        </ConfirmAction>
      )}
    </>
  );
}
export function EmployerDiscovery() {
  const session = useSession();
  const orgs =
    session.business?.organisations.filter(
      (o) => o.verified && ["owner", "admin", "recruiter"].includes(o.role),
    ) || [];
  const [org, setOrg] = useState(orgs[0]?.id || "");
  const [days, setDays] = useState("30");
  const [region, setRegion] = useState("");
  const [revision, setRevision] = useState(0);
  type Data = {
    totals: { kind: string; count: number }[];
    regions: {
      region: string;
      count: number;
      searches?: number;
      listing?: number;
      profile?: number;
    }[];
    keywords: {
      keyword: string;
      count: number;
      topRegion?: string;
      topRegionCount?: number;
    }[];
    keywordRegions: { keyword: string; region: string; count: number }[];
  };
  const [data, setData] = useState<Data | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const selected = orgs.find((o) => o.id === org);
  const enabled = hasDiscovery(selected?.tier || null);
  useEffect(() => {
    if (!enabled || !org) return;
    const c = new AbortController();
    setLoading(true);
    setMessage("");
    fetch(
      `/api/employers/discovery?organisation=${org}&days=${days}${region ? `&region=${region}` : ""}`,
      {
        cache: "no-store",
        signal: c.signal,
      },
    )
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (!c.signal.aborted) setData(d);
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setMessage(e.message);
          setData(null);
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [org, days, enabled, region, revision]);
  return (
    <section className="panel dot-surface employer-discovery">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Discovery · Growth & above</p>
          <h2>Where possibility finds you.</h2>
        </div>
        <span className="badge">
          {selected?.tier ? planLabels[selected.tier] : "No active plan"}
        </span>
      </div>
      <div className="insights-filters">
        <label className="field-label">
          Business
          <select value={org} onChange={(e) => setOrg(e.target.value)}>
            <option value="">Choose a business</option>
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Reporting period
          <select value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last 12 months</option>
          </select>
        </label>
      </div>
      <div className="insights-filters">
        <label className="field-label visitor-region-field">
          Visitor state
          <select value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">All regions</option>
            {[
              "ACT",
              "NSW",
              "NT",
              "QLD",
              "SA",
              "TAS",
              "VIC",
              "WA",
              "OTHER",
              "UNKNOWN",
            ].map((r) => (
              <option key={r} value={r}>
                {r === "OTHER" ? "Overseas" : r === "UNKNOWN" ? "Unknown" : r}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button secondary small"
          disabled={loading}
          onClick={() => setRevision((v) => v + 1)}
        >
          Refresh insights
        </button>
      </div>
      {!enabled ? (
        <div className="discovery-upgrade">
          <Compass size={32} />
          <h3>Make a clearer connection with your audience.</h3>
          <p className="muted">
            Search appearances, recognised keywords and regional insights are
            included in Growth and higher plans. Your private application
            dashboard remains available in Dashboard.
          </p>
          <Link href="/account?tab=billing" className="button secondary">
            Compare business plans
          </Link>
        </div>
      ) : (
        <>
          <div className="discovery-cards" aria-busy={loading}>
            {[
              ["search", "Search appearances"],
              ["listing", "Listing views"],
              ["profile", "Company profile views"],
            ].map(([k, l]) => (
              <div key={k}>
                <span>{l}</span>
                <strong>
                  {loading ? (
                    <span
                      className="skeleton-value"
                      aria-label="Loading statistic"
                    />
                  ) : data ? (
                    data.totals
                      .find((t) => t.kind === k)
                      ?.count.toLocaleString() || "0"
                  ) : (
                    "—"
                  )}
                </strong>
              </div>
            ))}
          </div>
          <div className="discovery-grid">
            <AustraliaDiscovery
              regions={data?.regions || []}
              selected={region}
              onSelect={setRegion}
            />
            <DiscoveryTables
              data={
                data || {
                  totals: [],
                  regions: [],
                  keywords: [],
                  keywordRegions: [],
                }
              }
              selected={region}
              loading={loading}
              error={Boolean(message)}
            />
          </div>
          <div className="fineprint discovery-disclaimer">
            <p>
              Recorded events from visitors who allow optional analytics. These
              are event counts, not unique people, complete traffic totals or
              evidence of an application. Repeated visits can count again.
            </p>
            <p>
              Business accounts, staff and known automated traffic is excluded
              where identifiable. Search appearances count a displayed results
              page containing your business’s roles. Keywords use recognised
              career terms only.
            </p>
            <p>Aggregates are retained for up to 12 months.</p>
          </div>
        </>
      )}
      {message && (
        <p role="status" className="message">
          {message}
        </p>
      )}
    </section>
  );
}
export function EmployerNotificationPreferences() {
  const [prefs, setPrefs] = useState({
    submissions: true,
    milestones: true,
    closing_reminders: true,
    follow_up_reminders: true,
    follow_up_days: 7,
    email_enabled: false,
  });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/employers/preferences", { cache: "no-store", signal: c.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (!c.signal.aborted) {
          if (d.preferences) setPrefs(d.preferences);
          setReady(true);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setMessage(e.message);
      });
    return () => c.abort();
  }, []);
  return (
    <details className="panel employer-notification-settings">
      <summary>Hiring notification preferences</summary>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const d = await sendJson("/api/employers/preferences", prefs);
            setMessage(d.message);
          } catch (e) {
            setMessage(
              e instanceof Error ? e.message : "Preferences were not saved.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {(
          [
            ["submissions", "New application submissions"],
            ["milestones", "Application milestones · 25, 50, 100 and 200"],
            ["closing_reminders", "Vacancy closing reminders · 3 days before"],
            [
              "follow_up_reminders",
              "Remind my team when a candidate is waiting for an update",
            ],
            [
              "email_enabled",
              "Also email me the hiring notices selected above",
            ],
          ] as const
        ).map(([k, l]) => (
          <label key={k} className="checkbox-label">
            <input
              type="checkbox"
              checked={prefs[k]}
              disabled={!ready}
              onChange={(e) => setPrefs({ ...prefs, [k]: e.target.checked })}
            />
            {l}
          </label>
        ))}
        <label className="field-label">
          Days before a follow-up reminder
          <input
            type="number"
            min={1}
            max={60}
            value={prefs.follow_up_days}
            onChange={(e) =>
              setPrefs({ ...prefs, follow_up_days: Number(e.target.value) })
            }
          />
        </label>
        <p className="fineprint">
          Reminders are sent to your hiring team. They do not send candidate
          messages or change application stages. Reminders are checked by the
          scheduled delivery service, so timing can vary. Verification and
          essential account notices remain enabled. Turning a notice off stops
          future notices; existing notices remain in your history.
        </p>
        <button className="button secondary" disabled={!ready || busy}>
          Save preferences <Check size={16} />
        </button>
      </form>
      {message && (
        <p role="status" className="message">
          {message}
        </p>
      )}
    </details>
  );
}
