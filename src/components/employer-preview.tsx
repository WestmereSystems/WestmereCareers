"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowRight, BarChart3, Compass } from "lucide-react";
import { EmployerInsights } from "./employer-insights";
import { AustraliaDiscovery } from "./australia-discovery";
export function EmployerPreview() {
  const initial = useSearchParams().get("tab");
  const [tab, setTab] = useState(
    initial === "discovery" ? "discovery" : "dashboard",
  );
  return (
    <>
      <div className="demo-workspace-banner">
        <span className="badge">Public demo</span>
        <span>
          Fictional company, roles and activity. No private applicant records or
          live hiring actions.
        </span>
        <Link className="text-link" href="/employers/sign-in">
          Create your workspace <ArrowRight size={16} />
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
            <div>
              <span>Search appearances</span>
              <strong>2,846</strong>
            </div>
            <div>
              <span>Listing views</span>
              <strong>1,284</strong>
            </div>
            <div>
              <span>Company profile views</span>
              <strong>429</strong>
            </div>
          </div>
          <div className="discovery-grid">
            <AustraliaDiscovery demo />
            <div>
              <h3>Recognised search keywords</h3>
              {[
                ["product design", 624],
                ["customer success", 318],
                ["software engineer", 246],
                ["operations", 129],
              ].map(([k, n]) => (
                <div key={k} className="keyword-row">
                  <span>{k}</span>
                  <strong>{n}</strong>
                </div>
              ))}
              <p className="fineprint">
                Illustrative counts. Live Discovery reports events from visitors
                who allow optional analytics; it does not identify individual
                people or measure all traffic.
              </p>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
