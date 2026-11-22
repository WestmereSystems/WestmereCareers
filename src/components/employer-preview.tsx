"use client";
import Link from "next/link";
import { useSession } from "./providers";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowRight, BarChart3, Compass } from "lucide-react";
import { EmployerInsights } from "./employer-insights";
import {
  AustraliaDiscovery,
  DiscoveryTables,
  demoDiscovery,
} from "./australia-discovery";
export function EmployerPreview() {
  const session = useSession();
  const initial = useSearchParams().get("tab");
  const [tab, setTab] = useState(
    initial === "discovery" ? "discovery" : "dashboard",
  );
  const [region, setRegion] = useState("");
  return (
    <>
      <div className="demo-workspace-banner">
        <span className="badge">Public demo</span>
        <span>
          Fictional company, roles and activity. No private applicant records or
          live hiring actions.
        </span>
        <Link
          className="text-link"
          href={
            session.marketplaceOpen
              ? "/employers/sign-in?register=1"
              : "/launch/register"
          }
        >
          Register your business
        </Link>
      </div>
      <section className="page-intro">
        <p className="eyebrow">Your hiring, in focus</p>
        <h1>A look inside your next chapter.</h1>
        <p className="muted">
          Explore an illustrative Westmere hiring dashboard. Filter the demo to
          see how activity comes together.
        </p>
      </section>
      <div className="profile-tabs" role="group" aria-label="Demo sections">
        <button
          aria-pressed={tab === "dashboard"}
          onClick={() => setTab("dashboard")}
        >
          <BarChart3 size={17} />
          Dashboard
        </button>
        <button
          aria-pressed={tab === "discovery"}
          onClick={() => setTab("discovery")}
        >
          <Compass size={17} />
          Discovery
        </button>
      </div>
      {tab === "dashboard" ? (
        <EmployerInsights demo />
      ) : (
        <section className="panel dot-surface">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Illustrative Growth plan</p>
              <h2>Where possibility finds you.</h2>
            </div>
            <span className="badge">Fictional · last 30 days</span>
          </div>
          <div className="discovery-cards">
            {(
              [
                ["searches", "Search appearances"],
                ["listing", "Listing views"],
                ["profile", "Company profile views"],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <span>{label}</span>
                <strong>
                  {demoDiscovery.regions
                    .filter((r) => !region || r.region === region)
                    .reduce((sum, r) => sum + (r[key] || 0), 0)
                    .toLocaleString()}
                </strong>
              </div>
            ))}
          </div>
          <label className="field-label visitor-region-field">
            Visitor region
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
                  {r}
                </option>
              ))}
            </select>
          </label>
          <div className="discovery-grid">
            <AustraliaDiscovery demo selected={region} onSelect={setRegion} />
            <DiscoveryTables data={demoDiscovery} selected={region} />
          </div>
        </section>
      )}
    </>
  );
}
