"use client";
import { useState } from "react";
import islands from "@/lib/indian-ocean-territories.json";
import regions from "@/lib/australia-regions.json";
export const regionName = (id: string) =>
  regions.find((r) => r.id === id)?.name ||
  (id === "OTHER" ? "Overseas" : id === "UNKNOWN" ? "Unknown" : "All regions");
export type DiscoveryData = {
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
export const demoDiscovery: DiscoveryData = {
  totals: [
    { kind: "search", count: 1682 },
    { kind: "listing", count: 734 },
    { kind: "profile", count: 233 },
  ],
  regions: regions.map((r, i) => ({
    region: r.id,
    count: [720, 530, 680, 310, 268, 96, 34, 11][i],
    searches: [420, 340, 450, 210, 164, 66, 24, 8][i],
    listing: [230, 140, 180, 80, 72, 22, 8, 2][i],
    profile: [70, 50, 50, 20, 32, 8, 2, 1][i],
  })),
  keywords: [
    {
      keyword: "product design",
      count: 624,
      topRegion: "VIC",
      topRegionCount: 318,
    },
    {
      keyword: "customer success",
      count: 318,
      topRegion: "NSW",
      topRegionCount: 161,
    },
    {
      keyword: "software engineer",
      count: 246,
      topRegion: "VIC",
      topRegionCount: 138,
    },
    { keyword: "operations", count: 1, topRegion: "WA", topRegionCount: 1 },
  ],
  keywordRegions: [
    { keyword: "product design", region: "VIC", count: 318 },
    { keyword: "product design", region: "NSW", count: 306 },
    { keyword: "customer success", region: "NSW", count: 161 },
    { keyword: "customer success", region: "VIC", count: 157 },
    { keyword: "software engineer", region: "QLD", count: 108 },
    { keyword: "software engineer", region: "VIC", count: 138 },
    { keyword: "operations", region: "WA", count: 1 },
  ],
};
export function AustraliaDiscovery({
  regions: data = [],
  demo = false,
  selected: controlled,
  onSelect,
}: {
  regions?: DiscoveryData["regions"];
  demo?: boolean;
  selected?: string;
  onSelect?: (id: string) => void;
}) {
  const [local, setLocal] = useState("");
  const selected = controlled ?? local;
  const rows = demo ? demoDiscovery.regions : data;
  const region = regions.find((r) => r.id === selected);
  const b = region?.id === "TAS" ? [370.5, 411, 40.8, 42.24] : region?.bounds;
  const zoom = b
    ? `${b[0] - 12} ${b[1] - 12} ${Math.max(b[2] + 24, 38)} ${Math.max(b[3] + 24, 38)}`
    : "0 0 490 470";
  function select(id: string) {
    if (onSelect) onSelect(id);
    else setLocal(id);
  }
  return (
    <div className="discovery-map-block">
      <svg
        className="discovery-state-map"
        viewBox={zoom}
        aria-label={`Australian state and territory map. ${regionName(selected)} selected.`}
      >
        {regions.map((r) => {
          const n = rows.find((d) => d.region === r.id);
          const searches = n?.searches ?? 0;
          return (
            <g
              key={r.id}
              transform={
                r.id === "TAS"
                  ? "translate(370.5 411) scale(0.8) translate(-361.3 -397.5)"
                  : undefined
              }
            >
              <path
                d={r.path}
                className={`discovery-region ${selected === r.id ? "selected" : ""}`}
                role="button"
                tabIndex={0}
                aria-label={`${r.name}: ${searches} search appearances`}
                aria-pressed={selected === r.id}
                onClick={() => select(r.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    select(r.id);
                  }
                }}
              >
                <title>{r.name}</title>
              </path>
              {searches > 0 && (
                <g className="capital-marker" pointerEvents="none">
                  <circle
                    cx={r.capitalPoint[0]}
                    cy={r.capitalPoint[1]}
                    r={selected ? 1.8 : 3.5}
                  />
                  <title>
                    {r.capital}: {searches} search appearances
                  </title>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <div className="map-region-buttons" aria-label="Choose a region">
        {regions.map((r) => (
          <button
            key={r.id}
            className="button secondary small"
            aria-pressed={selected === r.id}
            onClick={() => select(r.id)}
          >
            {r.id}
          </button>
        ))}
        <button className="button secondary small" onClick={() => select("")}>
          All regions
        </button>
      </div>
      {selected === "WA" && (
        <div className="territory-inset">
          <strong>Indian Ocean Territories · WA reporting</strong>
          <div className="island-outlines">
            {islands.map((i) => (
              <button
                type="button"
                key={i.name}
                onClick={() => select("WA")}
                aria-label={`${i.name}, included in WA reporting`}
              >
                <svg viewBox="0 0 90 70" aria-hidden="true">
                  <path d={i.path} />
                </svg>
                <span>{i.name}</span>
              </button>
            ))}
          </div>
          <small>
            External Australian territories, grouped with Western Australia in
            these insights.
          </small>
        </div>
      )}
      <p className="fineprint">
        {demo ? "Illustrative activity only. " : ""}Dots mark capital cities
        only when search appearances are recorded. Outlines select the whole
        region. Region is approximate visitor location, not the location
        searched.{" "}
        <a
          href="https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/edition-3-july-2021-june-2026/access-and-downloads/digital-boundary-files"
          target="_blank"
          rel="noopener noreferrer"
        >
          Map: ABS ASGS 2021, generalised.
        </a>
      </p>
    </div>
  );
}
export function DiscoveryTables({
  data,
  selected = "",
  loading = false,
  error = false,
}: {
  data: DiscoveryData;
  selected?: string;
  loading?: boolean;
  error?: boolean;
}) {
  const keywords = selected
    ? data.keywordRegions
        .filter((k) => k.region === selected)
        .map((k) => ({ ...k, topRegion: k.region, topRegionCount: k.count }))
    : data.keywords;
  const row = data.regions.find((r) => r.region === selected);
  const total = selected
    ? row?.count || 0
    : data.regions.reduce((sum, r) => sum + r.count, 0);
  return (
    <div
      className="discovery-insight-tables"
      aria-live="polite"
      aria-busy={loading}
    >
      <h3>{regionName(selected)} insights</h3>
      {!loading && !error && total === 0 && (
        <p className="notice">
          {selected
            ? "There is no data for the selected region."
            : "No data has been recorded for this period."}
        </p>
      )}
      <div className="table-scroll">
        <table>
          <caption>Recorded activity</caption>
          <thead>
            <tr>
              <th scope="col">Visitor region</th>
              <th scope="col">Searches</th>
              <th scope="col">Listing views</th>
              <th scope="col">Profile views</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <th scope="row">{regionName(selected)}</th>
                {[1, 2, 3].map((n) => (
                  <td key={n}>
                    <span
                      className="skeleton-value"
                      aria-label="Loading statistic"
                    />
                  </td>
                ))}
              </tr>
            ) : (
              (selected
                ? data.regions.filter((r) => r.region === selected)
                : data.regions
              ).map((r) => (
                <tr key={r.region}>
                  <th scope="row">{regionName(r.region)}</th>
                  <td>{r.searches || 0}</td>
                  <td>{r.listing || 0}</td>
                  <td>{r.profile || 0}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="table-scroll">
        <table>
          <caption>Recognised search keywords</caption>
          <thead>
            <tr>
              <th scope="col">Keyword</th>
              <th scope="col">Search appearances</th>
              <th scope="col">
                {selected ? "Visitor region" : "Most popular region"}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? [1, 2, 3].map((n) => (
                  <tr key={n}>
                    {[1, 2, 3].map((c) => (
                      <td key={c}>
                        <span
                          className="skeleton-value"
                          aria-label="Loading insight"
                        />
                      </td>
                    ))}
                  </tr>
                ))
              : keywords.map((k) => (
                  <tr key={k.keyword}>
                    <th scope="row">{k.keyword}</th>
                    <td>{k.count.toLocaleString()}</td>
                    <td>
                      <span className="badge">
                        {regionName(k.topRegion || "UNKNOWN")}
                      </span>
                      {!selected && k.topRegionCount ? (
                        <small> · {k.topRegionCount} appearances</small>
                      ) : null}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {!loading && !error && !keywords.length && (
        <p className="muted">
          No recognised search keywords recorded for this region and period.
        </p>
      )}
      <p className="fineprint">
        Every recorded recognised keyword appears, including one appearance.
        Ties for most popular region use alphabetical region codes. Arbitrary
        search text is not retained.
      </p>
    </div>
  );
}
