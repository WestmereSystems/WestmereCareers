"use client";
import { useState } from "react";
import { AustraliaIcon } from "./australia-icon";
const states = [
  { id: "WA", name: "Western Australia", x: 23, y: 47 },
  { id: "NT", name: "Northern Territory", x: 50, y: 26 },
  { id: "SA", name: "South Australia", x: 51, y: 58 },
  { id: "QLD", name: "Queensland", x: 74, y: 39 },
  { id: "NSW", name: "New South Wales", x: 78, y: 63 },
  { id: "VIC", name: "Victoria", x: 73, y: 73 },
  { id: "ACT", name: "Australian Capital Territory", x: 80, y: 67 },
  { id: "TAS", name: "Tasmania", x: 77, y: 85 },
];
export function AustraliaDiscovery({
  regions = [],
  demo = false,
}: {
  regions?: { region: string; count: number }[];
  demo?: boolean;
}) {
  const [selected, setSelected] = useState("VIC");
  const data = demo
    ? states.map((s, i) => ({
        region: s.id,
        count: [163, 74, 128, 286, 429, 382, 54, 47][i],
      }))
    : regions;
  const current = data.find((x) => x.region === selected);
  return (
    <div className={`australia-discovery ${demo ? "animated-map" : ""}`}>
      <div className="australia-map">
        <AustraliaIcon size={420} />
        {states.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`map-dot ${selected === s.id ? "selected" : ""}`}
            style={{
              left: `${s.x}%`,
              top: `${s.y}%`,
              animationDelay: `${i * 0.3}s`,
            }}
            onClick={() => setSelected(s.id)}
            onMouseEnter={() => setSelected(s.id)}
            onFocus={() => setSelected(s.id)}
            aria-label={`${s.name}: ${data.find((d) => d.region === s.id)?.count ?? "fewer than 5 or no"} recorded events`}
            aria-pressed={selected === s.id}
          >
            <span />
          </button>
        ))}
      </div>
      <div className="map-caption" aria-live="polite">
        <span className="live-dot" />
        <span>
          {states.find((s) => s.id === selected)?.name}
          <strong>
            {current
              ? current.count.toLocaleString() + " recorded events"
              : "No publishable count"}
          </strong>
        </span>
        <span className="badge">
          {demo ? "Illustrative data" : "Coarse regions"}
        </span>
      </div>
      <p className="fineprint">
        {demo
          ? "Demonstration only · fictional activity across Australia."
          : "Approximate visitor region, not the location they searched. Regional counts below 5 are withheld; unknown and overseas traffic are reported separately. Dots mark regions, not people."}
      </p>
    </div>
  );
}
