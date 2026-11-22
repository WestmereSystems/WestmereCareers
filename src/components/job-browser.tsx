"use client";
import { DiscoveryEvent } from "./privacy-choice";
import { findPlace } from "@/lib/locations";
import { discoveryKeyword } from "@/lib/discovery";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  LayoutGrid,
  Rows2,
  ArrowLeft,
  ArrowRight,
  Check,
  LoaderCircle,
  LockKeyhole,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import type { Job } from "@/lib/jobs";
import {
  parseJobQuery,
  serialiseJobQuery,
  type JobSort,
} from "@/lib/search";
import { SearchBar } from "./search-bar";
import { JobCard } from "./job-card";
import { useNotice, careerAccessNotice } from "./notices";
import { useSession } from "./providers";

type Result = {
  jobs: Job[];
  total: number;
  page: number;
  pageSize: number;
  error?: string;
  matches?: Record<
    string,
    { score: number; matchedSkills: string[]; missingSkills: string[] }
  >;
  searchedCount?: number;
  searchTotal?: number;
};
type Props = {
  initialJobs: Job[];
  source: "demo" | "live";
  initialKeyword?: string;
  initialLocation?: string;
  initialSort?: JobSort;
  initialTotal?: number;
  initialPage?: number;
  initialError?: string;
  initialWorkMode?: string[];
  initialEmploymentType?: string[];
  initialMinSalary?: number | null;
  initialDirectOnly?: boolean;
  initialDistance?: number | null;
  initialListedWithin?: number | null;
  initialListedFrom?: string;
  initialListedTo?: string;
};
const modes = ["Hybrid", "Remote", "On-site"];
const types = ["Full time", "Part time", "Contract", "Casual"];
const PAGE_SIZE = 12;

export function JobBrowser({
  initialJobs,
  source,
  initialKeyword = "",
  initialLocation = "",
  initialSort = "relevance",
  initialTotal = initialJobs.length,
  initialPage = 1,
  initialError,
  initialWorkMode = [],
  initialEmploymentType = [],
  initialMinSalary = null,
  initialDirectOnly = false,
  initialDistance = null,
  initialListedWithin = null,
  initialListedFrom = "",
  initialListedTo = "",
}: Props) {
  const session = useSession();
  const notice = useNotice();
  const [hasSearched, setHasSearched] = useState(
    Boolean(
      initialKeyword.trim() ||
      initialLocation.trim() ||
      initialWorkMode.length ||
      initialEmploymentType.length ||
      initialMinSalary ||
      initialDirectOnly,
    ),
  );
  const navigationQuery = useSearchParams().toString();
  const loadedKey = useRef(
    serialiseJobQuery({
      keyword: initialKeyword,
      location: initialLocation,
      workMode: initialWorkMode,
      employmentType: initialEmploymentType,
      minSalary: initialMinSalary,
      directOnly: initialDirectOnly,
      distance: initialDistance,
      listedWithin: initialListedWithin,
      listedFrom: initialListedFrom,
      listedTo: initialListedTo,
      sort: initialSort,
      page: initialPage,
    }),
  );
  const seenNavigation = useRef(navigationQuery);
  const lastWrittenQuery = useRef<string | null>(null);
  const pendingNavigationQuery = useRef<string | null>(null);
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  useEffect(() => {
    const saved = localStorage.getItem("westmere-job-layout");
    if (saved === "grid" || saved === "list") setLayout(saved);
  }, []);
  const [keyword, setKeyword] = useState(initialKeyword);
  const [location, setLocation] = useState(initialLocation);
  const [workMode, setWorkMode] = useState<string[]>(initialWorkMode);
  const [employmentType, setEmploymentType] = useState<string[]>(
    initialEmploymentType,
  );
  const [minSalary, setMinSalary] = useState<number | null>(initialMinSalary);
  const [directOnly, setDirectOnly] = useState(initialDirectOnly);
  const [distance, setDistance] = useState(initialDistance);
  const [listedWithin, setListedWithin] = useState(initialListedWithin);
  const [listedFrom, setListedFrom] = useState(initialListedFrom);
  const [listedTo, setListedTo] = useState(initialListedTo);
  const [sort, setSort] = useState<JobSort>(initialSort);
  const [page, setPage] = useState(initialPage);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cvOpen, setCvOpen] = useState(false);
  const [cv, setCv] = useState("");
  const [appliedCv, setAppliedCv] = useState("");
  const [baseCV, setBaseCV] = useState<{ id: string; filename: string } | null>(
    null,
  );
  const [baseLoading, setBaseLoading] = useState(false);
  const [appliedExtra, setAppliedExtra] = useState("");
  const [consent, setConsent] = useState(false);
  const [strongOnly, setStrongOnly] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [remote, setRemote] = useState<Result>({
    jobs: initialJobs,
    total: initialTotal,
    page: initialPage,
    pageSize: PAGE_SIZE,
    error: initialError,
  });
  const matching = Boolean(appliedCv) && consent && session.isPremium;
  const query = useMemo(
    () =>
      serialiseJobQuery({
        keyword,
        location,
        workMode,
        employmentType,
        minSalary,
        directOnly,
        distance,
        listedWithin,
        listedFrom,
        listedTo,
        sort,
        page,
      }),
    [
      keyword,
      location,
      workMode,
      employmentType,
      minSalary,
      directOnly,
      distance,
      listedWithin,
      listedFrom,
      listedTo,
      sort,
      page,
    ],
  );
  const result: Result = remote;

  useEffect(() => {
    if (!cvOpen || !session.user || !session.isPremium) return;
    const controller = new AbortController();
    setBaseLoading(true);
    fetch("/api/profile/cvs", { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        return d;
      })
      .then((d) => {
        const selected = d.cvs?.find(
          (c: { id: string }) => c.id === d.activeId,
        );
        setBaseCV(selected || null);
        if (appliedCv && appliedCv !== selected?.id) {
          setAppliedCv("");
          setMessage(
            "Your base CV changed. Compare again to refresh your results.",
          );
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setMessage(e.message || "Your base CV could not be checked.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setBaseLoading(false);
      });
    return () => controller.abort();
  }, [cvOpen, session.user?.id, session.isPremium]);

  // Next can reuse a cached page after native filter updates. Observe the current
  // URL as well as initial props, and distinguish our own writes from navigation.
  useEffect(() => {
    if (navigationQuery === seenNavigation.current) return;
    seenNavigation.current = navigationQuery;
    if (navigationQuery === lastWrittenQuery.current) {
      lastWrittenQuery.current = null;
      return;
    }
    const next = parseJobQuery(new URLSearchParams(navigationQuery));
    const canonical = serialiseJobQuery(next);
    pendingNavigationQuery.current = canonical === query ? null : canonical;
    setKeyword(next.keyword ?? "");
    setLocation(next.location ?? "");
    setWorkMode(next.workMode ?? []);
    setEmploymentType(next.employmentType ?? []);
    setMinSalary(next.minSalary ?? null);
    setDirectOnly(Boolean(next.directOnly));
    setDistance(next.distance ?? null);
    setListedWithin(next.listedWithin ?? null);
    setListedFrom(next.listedFrom ?? "");
    setListedTo(next.listedTo ?? "");
    setSort(next.sort ?? "relevance");
    setPage(next.page ?? 1);
    setCv("");
    setAppliedCv("");
    setConsent(false);
    setMessage("");
  }, [navigationQuery]);
  useEffect(() => {
    // A navigation render can still contain the previous local filters. Wait
    // for its parsed state before allowing local controls to write another URL.
    if (pendingNavigationQuery.current !== null) {
      if (pendingNavigationQuery.current === query)
        pendingNavigationQuery.current = null;
      return;
    }
    lastWrittenQuery.current = query;
    window.history.replaceState(null, "", `/jobs?${query}`);
  }, [query]);
  useEffect(() => {
    if (!session.isPremium && (cv || appliedCv)) {
      setCv("");
      setAppliedCv("");
      setConsent(false);
      setSort((value) => (value === "match" ? "relevance" : value));
    }
  }, [session.isPremium, cv, appliedCv]);
  useEffect(() => {
    if (source !== "live" && !matching) return;
    const requestKey = JSON.stringify([
      query,
      matching,
      appliedCv,
      appliedExtra,
      consent,
      strongOnly,
      sort,
      retry,
    ]);
    if (!matching && loadedKey.current === query && retry === 0) return;
    if (loadedKey.current === requestKey) return;
    const controller = new AbortController();
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const response = matching
          ? await fetch("/api/jobs/match", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                query,
                additionalExperience: appliedExtra,
                consent,
                page,
                strongOnly,
                sort,
              }),
              signal: controller.signal,
            })
          : await fetch(`/api/jobs?${query}`, {
              signal: controller.signal,
              cache: "no-store",
            });
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error || "We couldn’t load roles. Please try again.",
          );
        if (!controller.signal.aborted) {
          setRemote(data);
          loadedKey.current = requestKey;
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setRemote({
            jobs: [],
            total: 0,
            page,
            pageSize: PAGE_SIZE,
            error:
              error instanceof Error
                ? error.message
                : "We couldn’t connect. Please try again.",
          });
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    }, 120);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    source,
    query,
    matching,
    appliedCv,
    appliedExtra,
    consent,
    page,
    strongOnly,
    sort,
    retry,
  ]);

  function updateFilter(action: () => void) {
    action();
    setPage(1);
    setMessage("");
  }
  function toggle(
    list: string[],
    value: string,
    set: (values: string[]) => void,
  ) {
    updateFilter(() =>
      set(
        list.includes(value)
          ? list.filter((item) => item !== value)
          : [...list, value],
      ),
    );
  }
  function requestMatching() {
    if (session.business && !session.isPremium) {
      notice(careerAccessNotice);
      return;
    }
    setCvOpen(true);
    setMessage(
      session.isPremium
        ? ""
        : session.business
          ? "Use a personal Careers+ account or subscribe to Enterprise on this billing account for Strong Matches. Invited team accounts do not inherit Careers+."
          : "CV matching is included with Careers+. Browsing and applying stay free.",
    );
  }
  function applyCv() {
    if (!session.isPremium) {
      setMessage(
        session.business
          ? "Use a personal Careers+ account or subscribe to Enterprise on this billing account for Strong Matches."
          : "Careers+ is required to compare your CV.",
      );
      return;
    }
    if (!baseCV) {
      setMessage("Upload and select a base CV on your profile first.");
      return;
    }
    if (!consent) {
      setMessage("Please confirm the CV comparison consent before continuing.");
      return;
    }
    setAppliedCv(baseCV.id);
    setAppliedExtra(cv.trim());
    setSort("match");
    setPage(1);
    setMessage("");
  }
  function removeCv(clearText = false) {
    setAppliedCv("");
    setAppliedExtra("");
    setConsent(false);
    setSort("relevance");
    setPage(1);
    if (clearText) setCv("");
  }
  function editCv(value: string) {
    setCv(value);
  }
  function changeConsent(checked: boolean) {
    setConsent(checked);
    if (!checked) removeCv();
  }
  function clearAll() {
    setKeyword("");
    setLocation("");
    setWorkMode([]);
    setEmploymentType([]);
    setMinSalary(null);
    setDirectOnly(false);
    setDistance(null);
    setListedWithin(null);
    setListedFrom("");
    setListedTo("");
    removeCv(true);
    setMessage("");
  }
  const activeCount =
    workMode.length +
    employmentType.length +
    Number(Boolean(minSalary)) +
    Number(directOnly) +
    Number(Boolean(distance)) +
    Number(Boolean(listedWithin || listedFrom || listedTo));
  const savedQuery = new URLSearchParams(query);
  savedQuery.delete("samples");
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  useEffect(() => {
    if (!busy && !result.error && page > totalPages) setPage(totalPages);
  }, [busy, result.error, page, totalPages]);
  const selectedEmployment = employmentType.length
    ? employmentType.join(", ")
    : "Employment type";

  return (
    <>
      {source === "live" && !busy && !result.error && (
        <DiscoveryEvent
          organisations={result.jobs.flatMap((j) =>
            j.organisationId ? [j.organisationId] : [],
          )}
          kind="search"
          keyword={discoveryKeyword(keyword)}
        />
      )}
      {hasSearched && (
        <div className="search-save-row">
          <Link className="text-link" href={`/saved-searches?${savedQuery}`}>
            Save this search & choose email alerts →
          </Link>
        </div>
      )}
      <SearchBar
        key={`${keyword}|${location}`}
        initialKeyword={keyword}
        initialLocation={location}
        compact
        onSearch={(q, where) =>
          updateFilter(() => {
            setHasSearched(true);
            setKeyword(q);
            setLocation(where);
          })
        }
      />
      <div className="browse-toolbar">
        <div className="filter-chips">
          <button
            type="button"
            className="filter-chip"
            aria-pressed={filtersOpen}
            aria-expanded={filtersOpen}
            aria-controls="job-filter-panel"
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <SlidersHorizontal size={14} />
            All filters{activeCount > 0 && <span>({activeCount})</span>}
          </button>
          <button
            type="button"
            className="filter-chip"
            aria-pressed={workMode.includes("Remote")}
            onClick={() => toggle(workMode, "Remote", setWorkMode)}
          >
            Remote
          </button>
          <button
            type="button"
            className="filter-chip"
            aria-pressed={workMode.includes("Hybrid")}
            onClick={() => toggle(workMode, "Hybrid", setWorkMode)}
          >
            Hybrid
          </button>
          <button
            type="button"
            className="filter-chip"
            aria-pressed={directOnly}
            onClick={() => updateFilter(() => setDirectOnly(!directOnly))}
          >
            <Check size={13} />
            Apply on Westmere
          </button>
          <button
            type="button"
            className="filter-chip premium"
            aria-pressed={matching}
            aria-expanded={cvOpen}
            aria-controls="cv-match-panel"
            onClick={requestMatching}
          >
            {session.isPremium ? (
              <Sparkles size={13} />
            ) : (
              <LockKeyhole size={13} />
            )}
            Strong CV matches
          </button>
        </div>
        <label className="sort-control">
          Sort by
          <select
            aria-label="Sort roles"
            value={sort}
            onChange={(event) => {
              const value = event.target.value as JobSort;
              if (value === "match") {
                requestMatching();
                if (matching) updateFilter(() => setSort(value));
              } else updateFilter(() => setSort(value));
            }}
          >
            <option value="relevance">Relevance</option>
            <option value="newest">Newest first</option>
            <option value="salary-high">Highest advertised pay</option>
            <option value="response-fast">Fastest reported response</option>
            <option value="match">CV skill match · Careers+</option>
          </select>
        </label>
      </div>
      {filtersOpen && (
        <div className="filter-panel" id="job-filter-panel">
          <fieldset>
            <legend>Working arrangement</legend>
            {modes.map((value) => (
              <label className="checkbox-label" key={value}>
                <input
                  type="checkbox"
                  checked={workMode.includes(value)}
                  onChange={() => toggle(workMode, value, setWorkMode)}
                />
                {value}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>{selectedEmployment}</legend>
            {types.map((value) => (
              <label className="checkbox-label" key={value}>
                <input
                  type="checkbox"
                  checked={employmentType.includes(value)}
                  onChange={() =>
                    toggle(employmentType, value, setEmploymentType)
                  }
                />
                {value}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Distance</legend>
            <select
              aria-label="Distance from selected location"
              value={distance ?? ""}
              onChange={(e) =>
                updateFilter(() =>
                  setDistance(e.target.value ? Number(e.target.value) : null),
                )
              }
            >
              <option value="">Selected location only</option>
              {[5, 10, 25, 50, 100, 250].map((km) => (
                <option key={km} value={km}>
                  Within {km} km
                </option>
              ))}
            </select>
            <p className="fineprint">
              Straight-line distance from the selected town or city centre.
              Nationwide remote roles are included.
            </p>
            {distance && !findPlace(location) && (
              <p className="message" role="status">
                Choose a city or town and state from the location suggestions.
              </p>
            )}
          </fieldset>
          <fieldset>
            <legend>When listed</legend>
            <select
              aria-label="Listing time window"
              value={listedWithin ?? ""}
              onChange={(e) =>
                updateFilter(() => {
                  setListedWithin(
                    e.target.value ? Number(e.target.value) : null,
                  );
                  setListedFrom("");
                  setListedTo("");
                })
              }
            >
              <option value="">Any time</option>
              {[1, 3, 7, 14, 30, 40].map((days) => (
                <option key={days} value={days}>
                  Last {days === 1 ? "24 hours" : `${days} days`}
                </option>
              ))}
            </select>
            <label className="field-label">
              From date
              <input
                type="date"
                value={listedFrom}
                max={listedTo || undefined}
                onChange={(e) =>
                  updateFilter(() => {
                    setListedFrom(e.target.value);
                    setListedWithin(null);
                  })
                }
              />
            </label>
            <label className="field-label">
              Through date
              <input
                type="date"
                value={listedTo}
                min={listedFrom || undefined}
                onChange={(e) =>
                  updateFilter(() => {
                    setListedTo(e.target.value);
                    setListedWithin(null);
                  })
                }
              />
            </label>
            <p className="fineprint">
              Custom dates include the full day in UTC.
            </p>
          </fieldset>
          <fieldset>
            <legend>Annual salary</legend>
            <select
              aria-label="Annual salary filter"
              value={minSalary ?? ""}
              onChange={(e) =>
                updateFilter(() =>
                  setMinSalary(e.target.value ? Number(e.target.value) : null),
                )
              }
            >
              <option value="">Any advertised pay</option>
              <option value="60000">A$60,000 and above</option>
              <option value="80000">A$80,000 and above</option>
              <option value="100000">A$100,000 and above</option>
              <option value="120000">A$120,000 and above</option>
              <option value="150000">A$150,000 and above</option>
            </select>
            <p className="fineprint" style={{ maxWidth: 220, marginTop: 10 }}>
              Matches ranges reaching this amount. Hourly roles are excluded; no
              annual hours are assumed.
            </p>
          </fieldset>
          <button className="text-button" type="button" onClick={clearAll}>
            Clear all filters
          </button>
        </div>
      )}
      {cvOpen && (
        <section
          className="cv-filter-panel"
          id="cv-match-panel"
          aria-labelledby="cv-match-title"
        >
          <div className="actions-row">
            <h3 id="cv-match-title">
              <Sparkles
                size={16}
                style={{ verticalAlign: "middle", marginRight: 7 }}
              />
              Find work that fits your experience.
            </h3>
            <button
              type="button"
              className="icon-button"
              aria-label="Close CV matching"
              onClick={() => setCvOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
          {session.isPremium ? (
            <>
              <p className="fineprint">
                Your selected base CV is used automatically. Additional details
                receive a smaller bonus and cannot reduce a strong CV match.
                This is a skills comparison, not a prediction of hiring success.
              </p>
              <p className={baseCV ? "notice" : "notice warning"} role="status">
                {baseLoading ? (
                  "Checking your base CV…"
                ) : baseCV ? (
                  <>
                    Base CV selected: <strong>{baseCV.filename}</strong>.{" "}
                    <Link href="/account?tab=profile">
                      Change your base CV in Profile
                    </Link>
                    .
                  </>
                ) : (
                  <>
                    No base CV selected.{" "}
                    <Link href="/account?tab=profile">
                      Upload or select your base CV in Profile
                    </Link>{" "}
                    to compare roles.
                  </>
                )}
              </p>
              <p className="fineprint">
                Results use all filters currently applied on this page:{" "}
                {[
                  keyword && `Role: ${keyword}`,
                  location && `Location: ${location}`,
                  ...workMode,
                  ...employmentType,
                  minSalary && `A$${minSalary.toLocaleString()}+`,
                  directOnly && "Apply on Westmere",
                  distance && `Within ${distance} km`,
                  listedWithin && `Listed in ${listedWithin} days`,
                  listedFrom && `From ${listedFrom}`,
                  listedTo && `Through ${listedTo}`,
                ]
                  .filter(Boolean)
                  .join(" · ") || "All roles across Australia"}
                .
              </p>
              <label className="field-label" htmlFor="cv-match-text">
                Additional experience and skills (optional)
              </label>
              <textarea
                id="cv-match-text"
                maxLength={4000}
                value={cv}
                onChange={(e) => editCv(e.target.value)}
                placeholder="Add relevant experience or skills that are not yet in your base CV."
              />
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => changeConsent(e.target.checked)}
                />
                I agree to Westmere comparing my base CV and any additional
                details with these roles. Additional details are not saved or
                sent to OpenAI.
              </label>
              <div className="inline-actions">
                <button
                  type="button"
                  className="button purple small"
                  onClick={applyCv}
                  disabled={!baseCV || baseLoading}
                >
                  <Sparkles size={15} />
                  Compare my experience
                </button>
                <button
                  type="button"
                  className="button secondary small"
                  onClick={clearAll}
                >
                  Clear all filters
                </button>
              </div>
              {matching && (
                <label className="checkbox-label" style={{ marginTop: 12 }}>
                  <input
                    type="checkbox"
                    checked={strongOnly}
                    onChange={(e) =>
                      updateFilter(() => setStrongOnly(e.target.checked))
                    }
                  />
                  Show strong matches only
                </label>
              )}
            </>
          ) : (
            <>
              <p className="muted" style={{ fontSize: 15 }}>
                {session.business
                  ? "Use a personal Careers+ account or subscribe to Enterprise on this billing account to explore Strong Matches and CV preparation from a candidate’s perspective. Invited accounts do not inherit Careers+."
                  : "Careers+ helps you focus on roles that share the skills in your CV, then prepare a thoughtful application with personalised guidance."}
              </p>
              <div className="inline-actions">
                <Link
                  className="button purple small"
                  href={
                    session.business ? "/account?tab=billing" : "/careers-plus"
                  }
                >
                  {session.business ? "Review Enterprise" : "Explore Careers+"}
                  <ArrowRight size={15} />
                </Link>
                {!session.user && (
                  <button
                    type="button"
                    className="button secondary small"
                    onClick={session.openAuth}
                  >
                    Already a member? Sign in
                  </button>
                )}
              </div>
            </>
          )}
          {message && (
            <p role="status" className="fineprint" style={{ marginTop: 12 }}>
              {message}
            </p>
          )}
        </section>
      )}
      {sort === "salary-high" && (
        <p className="notice">
          Annual and hourly pay are shown in separate groups. Hourly rates are
          not converted into annual salaries.
        </p>
      )}
      {matching && source === "live" && result.searchedCount !== undefined && (
        <p className="notice">
          Compared {result.searchedCount} of {result.searchTotal} matching
          search results. CV matching currently checks up to the first 200 roles
          in your search, then ranks named skill overlap. Narrow your search to
          check a smaller set.
        </p>
      )}
      <div className="results-summary" role="status" aria-live="polite">
        <strong>
          {busy ? (
            <>
              <LoaderCircle
                size={14}
                className="spin"
                style={{ verticalAlign: "middle", marginRight: 7 }}
              />
              Finding your next possibility…
            </>
          ) : result.error ? (
            "Roles temporarily unavailable"
          ) : (
            `${result.total} ${result.total === 1 ? "role" : "roles"}${matching ? " matching your experience" : ""}${location ? ` · ${location}` : ""}`
          )}
        </strong>
        <div className="job-view-controls">
          <span>{activeCount > 0 ? `${activeCount} active filters` : ""}</span>
          <div role="group" aria-label="Job result layout">
            {(
              [
                ["grid", "Two-column grid", LayoutGrid],
                ["list", "Single-column list", Rows2],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                className="icon-button"
                aria-label={label}
                aria-pressed={layout === value}
                onClick={() => {
                  setLayout(value);
                  localStorage.setItem("westmere-job-layout", value);
                }}
              >
                <Icon size={19} />
              </button>
            ))}
          </div>
        </div>
      </div>
      <div aria-busy={busy}>
        {result.error ? (
          <div className="empty-state">
            <h2>A small pause in the search.</h2>
            <p>{result.error}</p>
            <button
              type="button"
              className="button primary"
              onClick={() => setRetry((value) => value + 1)}
            >
              Try again
              <ArrowRight size={16} />
            </button>
          </div>
        ) : !busy && result.jobs.length === 0 ? (
          <div className="empty-state">
            <div className="round-icon">
              <Search size={23} />
            </div>
            <h2>There’s room to explore.</h2>
            <p>
              Try a broader job title, another location, or fewer filters. Your
              next opportunity may be a little outside this search.
            </p>
            <button type="button" className="button primary" onClick={clearAll}>
              Start a fresh search
              <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <div
            className={`job-grid ${layout === "list" ? "job-list-layout" : ""}`}
          >
            {result.jobs.map((job) => (
              <JobCard
                job={job}
                key={job.id}
                match={matching ? result.matches?.[job.id]?.score : undefined}
              />
            ))}
          </div>
        )}
      </div>
      {!busy && !result.error && (
        <JobPagination
          page={page}
          total={totalPages}
          onChange={setPage}
          position="bottom"
        />
      )}
    </>
  );
}

function JobPagination({
  page,
  total,
  onChange,
  position,
}: {
  page: number;
  total: number;
  onChange: (page: number) => void;
  position: string;
}) {
  const pages = Array.from(
    new Set([
      1,
      ...[page - 1, page, page + 1].filter((n) => n > 0 && n <= total),
      total,
    ]),
  ).sort((a, b) => a - b);
  return (
    <nav
      aria-label={`Job result pages · ${position}`}
      className="numbered-pagination"
    >
      <button
        className="button secondary small"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <ArrowLeft size={15} />
        Previous
      </button>
      {pages.map((n, i) => (
        <span key={n}>
          {i > 0 && n - pages[i - 1] > 1 ? (
            <span aria-hidden="true">…</span>
          ) : null}
          <button
            className="page-number"
            aria-label={`Page ${n}`}
            aria-current={n === page ? "page" : undefined}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        </span>
      ))}
      <span className="fineprint">
        Page {page} of {total}
      </span>
      <button
        className="button secondary small"
        disabled={page >= total}
        onClick={() => onChange(page + 1)}
      >
        Next
        <ArrowRight size={15} />
      </button>
    </nav>
  );
}
