"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
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
import { demoJobs, type Job } from "@/lib/jobs";
import {
  cvMatch,
  filterJobs,
  parseJobQuery,
  serialiseJobQuery,
  type JobSort,
} from "@/lib/search";
import { SearchBar } from "./search-bar";
import { JobCard } from "./job-card";
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
}: Props) {
  const session = useSession();
  const navigationQuery = useSearchParams().toString();
  const seenNavigation = useRef(navigationQuery);
  const lastWrittenQuery = useRef<string | null>(null);
  const pendingNavigationQuery = useRef<string | null>(null);
  const [keyword, setKeyword] = useState(initialKeyword);
  const [location, setLocation] = useState(initialLocation);
  const [workMode, setWorkMode] = useState<string[]>(initialWorkMode);
  const [employmentType, setEmploymentType] = useState<string[]>(
    initialEmploymentType,
  );
  const [minSalary, setMinSalary] = useState<number | null>(initialMinSalary);
  const [directOnly, setDirectOnly] = useState(initialDirectOnly);
  const [sort, setSort] = useState<JobSort>(initialSort);
  const [page, setPage] = useState(initialPage);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cvOpen, setCvOpen] = useState(false);
  const [cv, setCv] = useState("");
  const [appliedCv, setAppliedCv] = useState("");
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
      sort,
      page,
    ],
  );
  const local = useMemo(() => {
    const jobs = filterJobs(demoJobs, {
      keyword,
      location,
      workMode,
      employmentType,
      minSalary,
      directOnly,
      sort,
      strongMatchesOnly: matching && strongOnly,
      cvText: matching ? appliedCv : "",
    });
    return {
      jobs: jobs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
      total: jobs.length,
      page,
      pageSize: PAGE_SIZE,
    };
  }, [
    keyword,
    location,
    workMode,
    employmentType,
    minSalary,
    directOnly,
    sort,
    matching,
    strongOnly,
    appliedCv,
    page,
  ]);
  const result: Result = source === "demo" ? local : remote;

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
    if (source !== "live") return;
    const controller = new AbortController();
    setBusy(true);
    setRemote({ jobs: [], total: 0, page, pageSize: PAGE_SIZE });
    const timer = setTimeout(async () => {
      try {
        const response = matching
          ? await fetch("/api/jobs/match", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                query,
                cv: appliedCv,
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
        if (!controller.signal.aborted) setRemote(data);
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
    setCvOpen(true);
    setMessage(
      session.isPremium
        ? ""
        : "CV matching is included with Careers+. Browsing and applying stay free.",
    );
  }
  function applyCv() {
    if (!session.isPremium) {
      setMessage("Careers+ is required to compare your CV.");
      return;
    }
    if (cv.trim().length < 40) {
      setMessage(
        "Add at least a few sentences from your CV so there is useful evidence to compare.",
      );
      return;
    }
    if (!consent) {
      setMessage("Please confirm the CV comparison consent before continuing.");
      return;
    }
    setAppliedCv(cv.trim());
    setSort("match");
    setPage(1);
    setMessage("");
  }
  function removeCv(clearText = false) {
    setAppliedCv("");
    setConsent(false);
    setSort("relevance");
    setPage(1);
    if (clearText) setCv("");
  }
  function editCv(value: string) {
    setCv(value);
    removeCv();
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
    removeCv(true);
    setMessage("");
  }
  const activeCount =
    workMode.length +
    employmentType.length +
    Number(Boolean(minSalary)) +
    Number(directOnly);
  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  useEffect(() => {
    if (!busy && !result.error && page > totalPages) setPage(totalPages);
  }, [busy, result.error, page, totalPages]);
  const selectedEmployment = employmentType.length
    ? employmentType.join(", ")
    : "Employment type";

  return (
    <>
      <SearchBar
        key={`${keyword}|${location}`}
        initialKeyword={keyword}
        initialLocation={location}
        compact
        onSearch={(q, where) =>
          updateFilter(() => {
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
                Compare the skills named in your CV with those listed by
                employers. A strong match means at least 60% of the listed
                skills appear in your CV; this is an evidence aid, not a
                prediction of hiring success.
              </p>
              <label className="field-label" htmlFor="cv-match-text">
                Your CV text
              </label>
              <textarea
                id="cv-match-text"
                maxLength={20000}
                value={cv}
                onChange={(e) => editCv(e.target.value)}
                placeholder="Paste relevant experience and skills. You can leave out contact details."
              />
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => changeConsent(e.target.checked)}
                />
                I agree to Westmere processing this text for this comparison.
                This filter does not save the text or send it to OpenAI.
              </label>
              <div className="inline-actions">
                <button
                  type="button"
                  className="button purple small"
                  onClick={applyCv}
                >
                  <Sparkles size={15} />
                  Compare my experience
                </button>
                {matching && (
                  <button
                    type="button"
                    className="button secondary small"
                    onClick={() => removeCv(true)}
                  >
                    Remove CV filter
                  </button>
                )}
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
              <p className="muted" style={{ fontSize: 13 }}>
                Careers+ helps you focus on roles that share the skills in your
                CV, then prepare a thoughtful application with OpenAI-powered
                guidance.
              </p>
              <div className="inline-actions">
                <Link className="button purple small" href="/careers-plus">
                  Explore Careers+
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
      {source === "demo" && (
        <p className="notice">
          Development preview · All employers, roles, pay and response figures
          shown here are fictional. Filters work on the sample inventory.
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
        <span>
          {activeCount > 0 &&
            `${activeCount} active ${activeCount === 1 ? "filter" : "filters"} · `}
          {!busy && result.total > 0
            ? `Page ${Math.min(page, totalPages)} of ${totalPages}`
            : "A little closer to your next chapter"}
        </span>
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
          <div className="job-grid">
            {result.jobs.map((job) => (
              <JobCard
                job={job}
                key={job.id}
                match={
                  matching
                    ? source === "demo"
                      ? cvMatch(job, appliedCv).score
                      : result.matches?.[job.id]?.score
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </div>
      {!busy && !result.error && totalPages > 1 && (
        <nav
          aria-label="Job result pages"
          className="actions-row"
          style={{ marginTop: 28 }}
        >
          <button
            type="button"
            className="button secondary small"
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            <ArrowLeft size={15} />
            Previous
          </button>
          <span className="fineprint">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className="button secondary small"
            disabled={page >= totalPages}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
            <ArrowRight size={15} />
          </button>
        </nav>
      )}
    </>
  );
}
