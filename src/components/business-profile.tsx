"use client";
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
} from "lucide-react";
import { useSession } from "./providers";
import { DashboardSkeleton } from "./skeleton";
import { EmployerBranding } from "./employer-branding";
import { AustraliaDiscovery } from "./australia-discovery";
import { hasDiscovery, planLabels } from "@/lib/business";
import { sendJson } from "./trust-workflows";
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
    suspended_at: string | null;
  };
  const [members, setMembers] = useState<
    { role: string; organisations: Org }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    fetch("/api/employers", { signal: c.signal, cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (!c.signal.aborted) setMembers(d.memberships || []);
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
        <h2>Your company profile.</h2>
        <p className="muted">
          Introduce your business, the people behind it and the opportunities
          ahead.
        </p>
      </div>
      {message && (
        <p className="message" role="status">
          {message}
        </p>
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
                src={`/api/employer-image?id=${o.id}&kind=banner`}
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
                  src={`/api/employer-image?id=${o.id}&kind=avatar`}
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
                  {o.is_verified && !o.suspended_at
                    ? "Business verified"
                    : "Verification pending"}
                </span>
              </div>
              <Link href={`/companies/${o.id}`} className="text-link">
                View public profile →
              </Link>
            </div>
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
          </section>
        ))
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
    regions: { region: string; count: number }[];
    keywords: { keyword: string; count: number }[];
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
    setData(null);
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
        if (!c.signal.aborted) setMessage(e.message);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [org, days, enabled, region, revision]);
  return (
    <section className="panel dot-surface">
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
        <label className="field-label">
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
      ) : loading ? (
        <DashboardSkeleton />
      ) : data ? (
        <>
          <div className="discovery-cards">
            {[
              ["search", "Search appearances"],
              ["listing", "Listing views"],
              ["profile", "Company profile views"],
            ].map(([k, l]) => (
              <div key={k}>
                <span>{l}</span>
                <strong>
                  {data.totals
                    .find((t) => t.kind === k)
                    ?.count.toLocaleString() || (region ? "<5 or none" : "0")}
                </strong>
              </div>
            ))}
          </div>
          <div className="discovery-grid">
            <AustraliaDiscovery regions={data.regions} />
            <div>
              <h3>Recognised search keywords</h3>
              {data.keywords.length ? (
                data.keywords.map((k) => (
                  <div key={k.keyword} className="keyword-row">
                    <span>{k.keyword}</span>
                    <strong>{k.count}</strong>
                  </div>
                ))
              ) : (
                <p className="muted">
                  No publishable keyword counts for this period. Each keyword
                  needs at least 5 recorded events.
                </p>
              )}
              <p className="fineprint">
                Unknown region:{" "}
                {data.regions.find((r) => r.region === "UNKNOWN")?.count ||
                  "below threshold or none"}
                . Overseas:{" "}
                {data.regions.find((r) => r.region === "OTHER")?.count ||
                  "below threshold or none"}
                .
              </p>
            </div>
          </div>
          <div className="keyword-state-table">
            <h3>Search queries by visitor state</h3>
            {data.keywordRegions?.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Recognised query</th>
                    <th>Visitor region</th>
                    <th>Appearances</th>
                  </tr>
                </thead>
                <tbody>
                  {data.keywordRegions.map((k) => (
                    <tr key={`${k.keyword}:${k.region}`}>
                      <td>{k.keyword}</td>
                      <td>{k.region}</td>
                      <td>{k.count.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">
                Each query and state combination needs at least five recorded
                events before it appears.
              </p>
            )}
          </div>
          <p className="fineprint">
            Recorded events from visitors who allow optional analytics. These
            are event counts, not unique people, complete traffic totals or
            evidence of an application. Repeated visits can count again.
            Business accounts, staff and known automated traffic is excluded
            where identifiable. Search appearances count a displayed results
            page containing your business’s roles. Keywords use recognised
            career terms only. Aggregates are retained for up to 12 months.
          </p>
        </>
      ) : null}
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
