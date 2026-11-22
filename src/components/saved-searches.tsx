"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  parseJobQuery,
  serialiseJobQuery,
  type JobFilters,
} from "@/lib/search";
import { savedSearchFilterCount } from "@/lib/saved-search-filters";
import { PageControls } from "./page-controls";
import { useSession } from "./providers";
import { sendJson } from "./trust-workflows";
type Saved = {
  id: string;
  name: string;
  keyword: string;
  location: string;
  work_modes: string[];
  employment_types: string[];
  min_salary: number | null;
  direct_only: boolean;
  distance?: number | null;
  listed_within?: number | null;
  listed_from?: string;
  listed_to?: string;
  alerts_enabled: boolean;
  frequency: "daily" | "weekly";
  next_run_at: string | null;
};
type Delivery = {
  id: string;
  search_id: string;
  kind: string;
  status: string;
  created_at: string;
};
const filtersOf = (s: Saved): JobFilters => ({
  keyword: s.keyword,
  location: s.location,
  workMode: s.work_modes,
  employmentType: s.employment_types,
  minSalary: s.min_salary,
  directOnly: s.direct_only,
  distance: s.distance,
  listedWithin: s.listed_within,
  listedFrom: s.listed_from,
  listedTo: s.listed_to,
});
function SearchForm({
  saved,
  seed,
  configured,
  onSave,
}: {
  saved: Saved | null;
  seed: JobFilters;
  configured: boolean;
  onSave: () => Promise<void>;
}) {
  const filters = saved ? filtersOf(saved) : seed;
  const [alerts, setAlerts] = useState(saved?.alerts_enabled ?? false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [filterCount, setFilterCount] = useState(
    savedSearchFilterCount(filters),
  );
  function countForm(form: HTMLFormElement) {
    const f = new FormData(form);
    return savedSearchFilterCount({
      keyword: String(f.get("keyword") || ""),
      location: String(f.get("location") || ""),
      workMode: f.getAll("workMode") as string[],
      employmentType: f.getAll("employmentType") as string[],
      minSalary: Number(f.get("salary")),
      directOnly: f.get("direct") === "on",
      listedWithin: Number(f.get("listedWithin")),
      listedFrom: String(f.get("listedFrom") || ""),
      listedTo: String(f.get("listedTo") || ""),
    });
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (countForm(e.currentTarget) < 2) {
      setMessage(
        "Choose at least two specific filters before saving your search.",
      );
      return;
    }
    setBusy(true);
    try {
      const d = await sendJson("/api/saved-searches", {
        id: saved?.id ?? null,
        name: f.get("name"),
        filters: {
          keyword: f.get("keyword"),
          location: f.get("location"),
          workMode: f.getAll("workMode"),
          employmentType: f.getAll("employmentType"),
          minSalary: f.get("salary") ? Number(f.get("salary")) : null,
          directOnly: f.get("direct") === "on",
          distance: f.get("distance") ? Number(f.get("distance")) : null,
          listedWithin: f.get("listedWithin")
            ? Number(f.get("listedWithin"))
            : null,
          listedFrom: f.get("listedFrom") || null,
          listedTo: f.get("listedTo") || null,
        },
        alertsEnabled: alerts,
        frequency: f.get("frequency"),
        consent: f.get("consent") === "on",
      });
      setMessage(d.message);
      await onSave();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Search could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="form-stack"
      onSubmit={submit}
      onChange={(e) => setFilterCount(countForm(e.currentTarget))}
    >
      <p className="fineprint">
        Choose at least two specific filters, such as a role and location.{" "}
        {filterCount} of 2 required filter groups selected. Selecting every
        option in a group does not narrow your search.
      </p>
      <label className="field-label">
        Search name
        <input
          name="name"
          required
          minLength={2}
          maxLength={100}
          defaultValue={
            saved?.name ??
            ([filters.keyword, filters.location].filter(Boolean).join(" in ") ||
              "My next chapter")
          }
        />
      </label>
      <div className="form-grid">
        <label className="field-label">
          Distance
          <select name="distance" defaultValue={filters.distance || ""}>
            <option value="">Selected location only</option>
            {[5, 10, 25, 50, 100, 250].map((km) => (
              <option key={km} value={km}>
                Within {km} km
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          When listed
          <select name="listedWithin" defaultValue={filters.listedWithin || ""}>
            <option value="">Any time</option>
            {[1, 3, 7, 14, 30, 40].map((days) => (
              <option key={days} value={days}>
                Last {days} days
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          From date (UTC)
          <input
            name="listedFrom"
            type="date"
            defaultValue={filters.listedFrom || ""}
          />
        </label>
        <label className="field-label">
          Through date (UTC)
          <input
            name="listedTo"
            type="date"
            defaultValue={filters.listedTo || ""}
          />
        </label>
      </div>
      <div className="form-grid">
        <label className="field-label">
          Job title or keywords
          <input
            name="keyword"
            maxLength={120}
            defaultValue={filters.keyword}
          />
        </label>
        <label className="field-label">
          Location
          <input
            name="location"
            maxLength={120}
            defaultValue={filters.location}
          />
        </label>
      </div>
      <fieldset>
        <legend>Work arrangement</legend>
        <div className="choice-row">
          {["On-site", "Hybrid", "Remote"].map((v) => (
            <label className="checkbox-label" key={v}>
              <input
                type="checkbox"
                name="workMode"
                value={v}
                defaultChecked={filters.workMode?.includes(v)}
              />
              {v}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Employment type</legend>
        <div className="choice-row">
          {["Full time", "Part time", "Contract", "Casual"].map((v) => (
            <label className="checkbox-label" key={v}>
              <input
                type="checkbox"
                name="employmentType"
                value={v}
                defaultChecked={filters.employmentType?.includes(v)}
              />
              {v}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="field-label">
        Minimum advertised annual salary (A$)
        <input
          name="salary"
          type="number"
          min={0}
          max={1000000}
          defaultValue={filters.minSalary ?? ""}
        />
      </label>
      <p className="fineprint">
        Only advertised annual salary ranges are compared. Hourly roles are
        excluded; annual hours are not assumed.
      </p>
      <label className="checkbox-label">
        <input
          type="checkbox"
          name="direct"
          defaultChecked={filters.directOnly}
        />
        Only roles accepting applications on Westmere
      </label>
      <label className="field-label">
        Email frequency
        <select name="frequency" defaultValue={saved?.frequency ?? "daily"}>
          <option value="daily">Daily digest</option>
          <option value="weekly">Weekly digest</option>
        </select>
      </label>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={alerts}
          disabled={!configured && !alerts}
          onChange={(e) => setAlerts(e.target.checked)}
        />
        Email me new matching roles
      </label>
      {alerts && (
        <label className="checkbox-label consent-label">
          <input type="checkbox" name="consent" required />I agree to job-alert
          emails for these filters at my verified account email. I can pause
          them here or unsubscribe from any alert.
        </label>
      )}
      <p className="fineprint">
        Only new, approved listings since you enabled alerts are included. No
        email is sent when there are no new matches. CV matching stays in the
        job browser; your CV is never saved in these filters or included in
        alerts.
      </p>
      <button className="button primary" disabled={busy || filterCount < 2}>
        {busy ? "Saving…" : saved ? "Update saved search" : "Save this search"}
      </button>
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
    </form>
  );
}
function SavedSearchesForUser() {
  const session = useSession(),
    params = useSearchParams();
  const seed = parseJobQuery(params);
  const [searches, setSearches] = useState<Saved[]>([]),
    [deliveries, setDeliveries] = useState<Delivery[]>([]),
    [configured, setConfigured] = useState(false),
    [suppressed, setSuppressed] = useState(false),
    [message, setMessage] = useState(""),
    [editing, setEditing] = useState<Saved | null>(null),
    [ready, setReady] = useState(false),
    [previewAvailableAt, setPreviewAvailableAt] = useState(0),
    [clock, setClock] = useState(Date.now()),
    [previewBusy, setPreviewBusy] = useState(false);
  const [emailPage, setEmailPage] = useState(1);
  const [deliveryTotal, setDeliveryTotal] = useState(0);
  const previewPending = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const r = await fetch(`/api/saved-searches?emailPage=${emailPage}`, {
          cache: "no-store",
          signal,
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (signal?.aborted) return;
        setSearches(d.searches);
        setDeliveryTotal(d.deliveryTotal || 0);
        setDeliveries(d.deliveries);
        setConfigured(d.configured);
        setSuppressed(d.suppressed);
        setPreviewAvailableAt(
          d.previewAvailableAt ? Date.parse(d.previewAvailableAt) : 0,
        );
        setReady(true);
      } catch (e) {
        if (!signal?.aborted)
          setMessage(
            e instanceof Error ? e.message : "Saved searches are unavailable.",
          );
      }
    },
    [emailPage],
  );
  useEffect(() => {
    const c = new AbortController();
    if (session.user) void load(c.signal);
    return () => c.abort();
  }, [session.user?.id, load]);
  async function action(s: Saved, type: "pause" | "delete" | "preview") {
    if (type === "preview") {
      if (previewPending.current || previewAvailableAt > Date.now()) return;
      previewPending.current = true;
      setPreviewBusy(true);
    }
    try {
      const d =
        type === "pause"
          ? await sendJson("/api/saved-searches", {
              id: s.id,
              name: s.name,
              filters: filtersOf(s),
              alertsEnabled: false,
              frequency: s.frequency,
              consent: false,
            })
          : await sendJson(
              type === "preview"
                ? "/api/saved-searches/preview"
                : "/api/saved-searches",
              { id: s.id },
              type === "delete" ? "DELETE" : "POST",
            );
      setMessage(d.message);
      if (type === "preview")
        setPreviewAvailableAt(Date.now() + 15 * 60 * 1000);
      if (editing?.id === s.id) setEditing(null);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Please try again.");
      if (type === "preview") await load();
    } finally {
      if (type === "preview") {
        previewPending.current = false;
        setPreviewBusy(false);
      }
    }
  }
  if (session.loading) return <p role="status">Loading your account…</p>;
  if (!session.user)
    return (
      <div className="panel">
        <h2>Keep a good search close.</h2>
        <p>
          Sign in to save your filters across devices and choose optional email
          alerts.
        </p>
        <button className="button primary" onClick={session.openAuth}>
          Sign in to save a search
        </button>
      </div>
    );
  return (
    <>
      <p className="notice">
        {suppressed
          ? "Email delivery is paused after a bounce or complaint. Contact support before re-enabling alerts."
          : configured
            ? "Job alerts go to your verified account email. You choose when to hear from us."
            : "Your searches can be saved now. Email delivery is being connected; no alerts will be sent until setup is complete."}
      </p>
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
      <p className="fineprint">
        Keep up to 20 searches. Wait 15 minutes between preview emails across
        all your searches.
      </p>
      <div className="saved-search-layout">
        <section className="panel">
          <h2>{editing ? "Refine your search." : "Save your next chapter."}</h2>
          {editing && (
            <button className="text-link" onClick={() => setEditing(null)}>
              Create a new search instead
            </button>
          )}
          <SearchForm
            key={editing?.id ?? params.toString()}
            saved={editing}
            seed={seed}
            configured={configured && !suppressed}
            onSave={async () => {
              await load();
            }}
          />
        </section>
        <section>
          <h2>Your saved searches</h2>
          {!ready && <p role="status">Loading saved searches…</p>}
          {ready && !searches.length && (
            <p className="muted">Your first saved search will appear here.</p>
          )}
          {searches.map((s) => (
            <article className="panel" key={s.id}>
              <h3>{s.name}</h3>
              <p>
                {s.keyword || "All roles"} · {s.location || "Across Australia"}
              </p>
              <p className="fineprint">
                {s.alerts_enabled
                  ? `${s.frequency} alerts enabled`
                  : "Email alerts paused"}
              </p>
              <div className="actions-row">
                <Link
                  className="button secondary"
                  href={`/jobs?${serialiseJobQuery(filtersOf(s))}`}
                >
                  Run search
                </Link>
                <button
                  className="button secondary"
                  onClick={() => setEditing(s)}
                >
                  Edit
                </button>
                {s.alerts_enabled && (
                  <button
                    className="button secondary"
                    onClick={() => void action(s, "pause")}
                  >
                    Pause alerts
                  </button>
                )}
                <button
                  className="button secondary"
                  onClick={() => void action(s, "delete")}
                >
                  Delete
                </button>
                {s.alerts_enabled && configured && !suppressed && (
                  <button
                    className="text-link"
                    disabled={previewBusy || previewAvailableAt > clock}
                    onClick={() => void action(s, "preview")}
                  >
                    {previewBusy
                      ? "Queueing preview…"
                      : previewAvailableAt > clock
                        ? `Preview available in ${Math.ceil((previewAvailableAt - clock) / 60000)} min`
                        : "Send a preview to my email"}
                  </button>
                )}
              </div>
            </article>
          ))}
        </section>
      </div>
      {deliveryTotal > 0 && (
        <section className="panel">
          <h2>Recent email activity</h2>
          <p className="fineprint">
            Accepted means our email delivery service accepted the request.
            Delivered means the receiving mail server accepted it; neither
            confirms it was read or placed in your inbox.
          </p>
          {deliveries.map((d) => (
            <p className="activity-item" key={d.id}>
              {searches.find((s) => s.id === d.search_id)?.name ??
                "Saved search"}{" "}
              · {d.kind} · {d.status} ·{" "}
              {new Date(d.created_at).toLocaleString("en-AU")}
            </p>
          ))}
          <PageControls
            page={emailPage}
            total={deliveryTotal}
            size={10}
            label="Recent email activity pages"
            onPage={setEmailPage}
          />
          <button className="button secondary" onClick={() => void load()}>
            Refresh delivery status
          </button>
        </section>
      )}
    </>
  );
}

export function SavedSearches() {
  const session = useSession();
  return <SavedSearchesForUser key={session.user?.id ?? "signed-out"} />;
}
