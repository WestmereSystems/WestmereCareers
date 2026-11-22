"use client";

import { useEffect, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  CheckCheck,
  Clock3,
  Download,
  RefreshCw,
  Users,
} from "lucide-react";
import { DashboardSkeleton } from "./skeleton";
import { summariseHiring } from "@/lib/hiring-statistics";
import type { HiringStatistics } from "@/lib/hiring-statistics";
import { useSession } from "./providers";

type Payload = {
  statistics: HiringStatistics;
  businesses: { id: string; name: string }[];
  roles: { id: string; title: string }[];
};
const date = (value: string) =>
  new Date(value).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    timeZone: "Australia/Melbourne",
  });
export function EmployerInsights({
  revision = 0,
  demo = false,
}: {
  revision?: number;
  demo?: boolean;
}) {
  const session = useSession();
  const [period, setPeriod] = useState("30");
  const [business, setBusiness] = useState("");
  const [role, setRole] = useState("");
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (demo) {
      const now = Date.now(),
        day = 86400000;
      const roles = [
        "Product Designer",
        "Customer Success Manager",
        "Software Engineer",
      ].map((title, i) => ({
        id: `demo-role-${i}`,
        title,
        organisation_id: "demo-company",
        status: "published",
        published_at: new Date(now - 40 * day).toISOString(),
        expires_at: null,
      }));
      const applications = Array.from({ length: 128 }, (_, i) => ({
        id: `demo-app-${i}`,
        job_id: roles[i % 3].id,
        status: [
          "received",
          "opened",
          "shortlisted",
          "interview",
          "offer",
          "not_proceeding",
        ][i % 6],
        created_at: new Date(now - ((i % 58) + 0.2) * day).toISOString(),
        application_events:
          i % 6
            ? [
                {
                  event_type: "opened",
                  occurred_at: new Date(
                    now - ((i % 58) + 0.1) * day,
                  ).toISOString(),
                },
              ]
            : [],
      }));
      const chosen = role ? roles.filter((r) => r.id === role) : roles;
      setPayload({
        statistics: summariseHiring(
          chosen,
          applications.filter((a) => chosen.some((r) => r.id === a.job_id)),
          Number(period),
          now,
        ),
        businesses: [
          { id: "demo-company", name: "Fernbridge Studio · fictional" },
        ],
        roles: roles.map((r) => ({ id: r.id, title: r.title })),
      });
      return;
    }
    if (!session.user) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ days: period });
    if (business) query.set("organisation", business);
    if (role) query.set("job", role);
    fetch(`/api/employers/statistics?${query}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error || "Hiring statistics are temporarily unavailable.",
          );
        if (!controller.signal.aborted) setPayload(data);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setPayload(null);
          setError(
            cause instanceof Error
              ? cause.message
              : "Hiring statistics are temporarily unavailable.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [session.user?.id, period, business, role, retry, revision, demo]);
  const data = payload?.statistics;
  const change = data ? data.totalApplications - data.previousApplications : 0;
  function download() {
    if (!data) return;
    const cell = (value: string | number) =>
      `"${String(value)
        .replaceAll('"', '""')
        .replace(/^[=+@\-\t\r]/, "'$&")}"`;
    const rows = [
      [
        "Role",
        "Status",
        "Applications",
        "Opened",
        "Awaiting review",
        "Shortlisted",
        "Interviews",
        "Offers",
      ],
      ...data.byRole.map((item) => [
        item.title,
        item.status,
        item.applications,
        item.opened,
        item.awaiting,
        item.shortlisted,
        item.interviews,
        item.offers,
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `westmere-hiring-${date(data.from).replaceAll(" ", "-")}-${date(data.through).replaceAll(" ", "-")}.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (!session.user && !demo)
    return (
      <section className="hiring-insights-intro">
        <div className="insights-intro-mark">
          <BarChart3 size={32} />
        </div>
        <div>
          <p className="eyebrow">A clearer view of your hiring</p>
          <h2>Your next great hire starts with insight.</h2>
          <p>
            Follow application activity, see how your roles are performing and
            give every candidate a clearer next step. Your private hiring
            dashboard brings it together.
          </p>
        </div>
        <button className="button secondary" onClick={session.openAuth}>
          Explore your workspace <ArrowUpRight size={17} />
        </button>
      </section>
    );
  return (
    <section
      className="hiring-insights panel dashboard-panel"
      aria-labelledby="hiring-insights-heading"
      aria-busy={loading}
    >
      <div className="insights-heading">
        <div>
          <p className="eyebrow">Your hiring, in focus</p>
          <h2 id="hiring-insights-heading">A clearer picture.</h2>
          <p className="muted">
            Understand your pipeline. Make the next step count.
          </p>
        </div>
        <div className="insights-actions">
          <button
            className="icon-button"
            aria-label="Refresh hiring statistics"
            disabled={loading}
            onClick={() => setRetry((value) => value + 1)}
          >
            <RefreshCw size={17} />
          </button>
          <button
            className="button secondary small"
            disabled={!data || loading}
            onClick={download}
          >
            <Download size={15} />
            Export CSV
          </button>
        </div>
      </div>
      <div className="insights-filters">
        <label>
          Period
          <select
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
          >
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last 12 months</option>
          </select>
        </label>
        <label>
          Business
          <select
            value={business}
            onChange={(event) => {
              setBusiness(event.target.value);
              setRole("");
            }}
          >
            <option value="">All your verified businesses</option>
            {payload?.businesses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Role
          <select
            value={role}
            onChange={(event) => setRole(event.target.value)}
          >
            <option value="">All roles</option>
            {payload?.roles.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      {loading && <DashboardSkeleton />}
      {error && (
        <p className="message" role="alert">
          {error}{" "}
          <button
            className="text-button"
            onClick={() => setRetry((value) => value + 1)}
          >
            Try again
          </button>
        </p>
      )}
      {data && (
        <>
          <div className="insights-metrics">
            <div>
              <span>
                <BriefcaseBusiness size={17} />
                Open roles
              </span>
              <strong>{data.openRoles}</strong>
              <small>
                {data.draftRoles} draft · {data.closedRoles} closed or expired
              </small>
            </div>
            <div>
              <span>
                <Users size={17} />
                Applications
              </span>
              <strong>{data.totalApplications}</strong>
              <small className="metric-change">
                {change >= 0 ? (
                  <ArrowUpRight size={14} />
                ) : (
                  <ArrowDownRight size={14} />
                )}
                {Math.abs(change)} {change < 0 ? "fewer" : "more"} than previous{" "}
                {period === "365" ? "12 months" : `${period} days`}
              </small>
            </div>
            <div>
              <span>
                <CheckCheck size={17} />
                Opened by your team
              </span>
              <strong>
                {data.reviewRate === null ? "—" : `${data.reviewRate}%`}
              </strong>
              <small>
                {data.reviewed} of {data.totalApplications} applications
              </small>
            </div>
            <div>
              <span>
                <Clock3 size={17} />
                First candidate update
              </span>
              <strong>
                {data.averageFirstResponseDays === null
                  ? "—"
                  : data.averageFirstResponseDays}
                <em>{data.averageFirstResponseDays === null ? "" : " days"}</em>
              </strong>
              <small>
                {data.responseSample
                  ? `Average across ${data.responseSample} applications with an update`
                  : "No candidate updates recorded yet"}
              </small>
            </div>
          </div>
          <div className="insights-charts">
            <section className="insights-chart">
              <div className="insights-chart-heading">
                <div>
                  <h3>Application activity</h3>
                  <p>
                    {date(data.from)} – {date(data.through)}
                  </p>
                </div>
                <span className="insight-chart-key">
                  <i />
                  Applications
                </span>
              </div>
              <div
                className="activity-chart"
                role="img"
                aria-label={`${data.totalApplications} applications between ${date(data.from)} and ${date(data.through)}. Detailed counts are available below.`}
              >
                {data.trend.map((bucket, index) => (
                  <div className="activity-column" key={bucket.start}>
                    <span className="activity-value">{bucket.count}</span>
                    <div className="activity-bar-track">
                      <span
                        className="activity-bar"
                        style={{
                          height: `${(bucket.count / Math.max(1, ...data.trend.map((item) => item.count))) * 100}%`,
                        }}
                      />
                    </div>
                    <time dateTime={bucket.start}>
                      {index % 2 === 0 || index === 7 ? date(bucket.start) : ""}
                    </time>
                  </div>
                ))}
              </div>
              <details className="chart-data">
                <summary>View activity data</summary>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Period</th>
                      <th scope="col">Applications</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.trend.map((bucket) => (
                      <tr key={bucket.start}>
                        <th scope="row">
                          {date(bucket.start)} – {date(bucket.end)}
                        </th>
                        <td>{bucket.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </section>
            <section className="insights-chart">
              <div className="insights-chart-heading">
                <div>
                  <h3>Your current pipeline</h3>
                  <p>Current stage of applications in this period</p>
                </div>
              </div>
              <div className="pipeline-chart">
                {data.stages.map((stage) => (
                  <div
                    key={stage.id}
                    className={`pipeline-row stage-${stage.id}`}
                  >
                    <div>
                      <span>{stage.label}</span>
                      <strong>{stage.count}</strong>
                    </div>
                    <div className="pipeline-track">
                      <span
                        style={{
                          width: `${(stage.count / Math.max(1, data.totalApplications)) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <div className="hiring-action-insights">
            <div>
              <span className="insight-label">Your next useful step</span>
              <h3>
                {data.awaitingReview
                  ? `${data.awaitingReview} application${data.awaitingReview === 1 ? " is" : "s are"} awaiting a first review.`
                  : data.totalApplications
                    ? "You’re keeping your candidates in view."
                    : "Your next chapter starts with a clear role."}
              </h3>
              <p>
                {data.awaitingOverSevenDays
                  ? `${data.awaitingOverSevenDays} have waited at least seven days. An intentional review and a useful update can bring a little clarity.`
                  : data.totalApplications
                    ? "Open a role below to review applications and record a useful candidate update."
                    : "Create a role below. Activity will appear here as candidates apply on Westmere."}
              </p>
            </div>
            <div>
              <span className="insight-label">Time to first review</span>
              <strong>
                {data.averageFirstReviewDays === null
                  ? "—"
                  : `${data.averageFirstReviewDays} days`}
              </strong>
              <p>
                {data.reviewed
                  ? `Average across ${data.reviewed} intentionally opened applications.`
                  : "Recorded when your team intentionally opens an application."}
              </p>
            </div>
          </div>
          <section className="insights-role-table">
            <div className="insights-chart-heading">
              <div>
                <h3>Role performance</h3>
                <p>Compare activity across your opportunities</p>
              </div>
            </div>
            {data.byRole.length ? (
              <div className="insights-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Role</th>
                      <th scope="col">Applications</th>
                      <th scope="col">Opened by team</th>
                      <th scope="col">Awaiting review</th>
                      <th scope="col">Shortlisted</th>
                      <th scope="col">Interviews</th>
                      <th scope="col">Offers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byRole.map((item) => (
                      <tr key={item.id}>
                        <th scope="row">
                          {item.title}
                          <small>{item.status}</small>
                        </th>
                        <td>{item.applications}</td>
                        <td>{item.opened}</td>
                        <td>{item.awaiting}</td>
                        <td>{item.shortlisted}</td>
                        <td>{item.interviews}</td>
                        <td>{item.offers}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="insights-empty">
                Your role-level overview will appear once your verified business
                has created a vacancy.
              </p>
            )}
          </section>
          <p className="insights-methodology">
            Westmere applications submitted in the selected period, excluding
            withdrawals. Open roles reflect current availability. Stages show
            current status, not a cumulative conversion funnel. First updates
            are recorded employer messages or decisions; opening an application
            alone is not a response. External applications and hires are not
            inferred. Last refreshed{" "}
            {new Date(data.through).toLocaleTimeString("en-AU", {
              hour: "numeric",
              minute: "2-digit",
            })}
            .
          </p>
        </>
      )}
    </section>
  );
}
