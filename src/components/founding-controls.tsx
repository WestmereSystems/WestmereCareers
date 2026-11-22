"use client";
import { useCallback, useEffect, useState } from "react";
import { LaunchAdministration } from "./launch-administration";
import { useSession } from "./providers";
import { sendJson } from "./trust-workflows";
type Content = {
  id: string;
  name?: string;
  title?: string;
  description?: string;
  website?: string;
  careersEmail?: string;
  avatarPath?: string;
  bannerPath?: string;
  verified?: boolean;
  test?: boolean;
  owner?: boolean;
  review?: string;
  status?: string;
  organisationId?: string;
  jobsPublicationEnabled?: boolean;
  publicationAllowed?: boolean;
  publicationOptedOut?: boolean;
  consentedAt: string | null;
  releasedAt: string | null;
};
type AccessRequest = {
  id: string;
  email: string;
  kind: string;
  name: string;
  business_name: string;
  vacancy_url: string;
  status: string;
  created_at: string;
};
type Queue = {
  marketplaceOpen: boolean;
  requestCount: number;
  requests: AccessRequest[];
  profiles: Content[];
  jobs: Content[];
};
export function FoundingAdmin() {
  const session = useSession(),
    [offset, setOffset] = useState(0),
    [data, setData] = useState<Queue | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const r = await fetch(`/api/admin/launch?offset=${offset}`, {
          cache: "no-store",
          signal,
        });
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (!signal?.aborted) setData(d);
      } catch (e) {
        if (!signal?.aborted)
          setMessage(
            e instanceof Error ? e.message : "Launch controls unavailable.",
          );
      }
    },
    [offset],
  );
  useEffect(() => {
    const c = new AbortController();
    void load(c.signal);
    return () => c.abort();
  }, [load]);
  async function decide(
    e: React.FormEvent<HTMLFormElement>,
    action: string,
    id?: string,
    kind?: string,
    open = false,
  ) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const d = await sendJson("/api/admin/launch", {
        action,
        ...(id ? { id } : {}),
        ...(kind ? { kind } : {}),
        reason: f.get("reason"),
        open,
      });
      setMessage(d.message);
      await load();
      await session.refresh();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Decision could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  function reason() {
    return (
      <label>
        Decision reason
        <input
          name="reason"
          minLength={10}
          maxLength={2000}
          required
          placeholder="Record why this decision is appropriate"
        />
      </label>
    );
  }
  function content(items: Content[], kind: "profile" | "job") {
    return items.map((item) => (
      <article key={item.id}>
        <strong>{item.name || item.title}</strong>
        <p>
          {item.test
            ? "Fictional test content · public release blocked"
            : item.releasedAt && data?.marketplaceOpen
              ? "Released publicly"
              : item.releasedAt
                ? "Private · public launch is closed"
                : (kind === "job" ? item.publicationAllowed : item.consentedAt)
                  ? kind === "job" && !item.consentedAt
                    ? "Default job publication enabled · awaiting release"
                    : "Owner permission recorded · awaiting release"
                  : "Private · owner permission required"}
          {item.review && ` · Review: ${item.review}`}
        </p>
        {kind === "profile" && (
          <details>
            <summary>Review profile content</summary>
            {item.bannerPath && (
              <img
                src={`/api/employer-image?id=${item.id}&kind=banner`}
                alt="Business banner submitted for review"
                style={{ width: "100%", maxHeight: 220, objectFit: "cover" }}
              />
            )}
            {item.avatarPath && (
              <img
                src={`/api/employer-image?id=${item.id}&kind=avatar`}
                alt="Business logo submitted for review"
                width={72}
                height={72}
              />
            )}
            <p style={{ whiteSpace: "pre-wrap" }}>
              {item.description || "No description supplied."}
            </p>
            <p>Website: {item.website || "Not supplied"}</p>
            <p>Public careers email: {item.careersEmail || "Not supplied"}</p>
          </details>
        )}
        {!item.test && (
          <form
            onSubmit={(e) =>
              void decide(
                e,
                item.releasedAt ? "hide" : "release",
                item.id,
                kind,
              )
            }
          >
            {reason()}
            <button
              className="button secondary small"
              disabled={
                busy ||
                (!item.releasedAt && !data?.marketplaceOpen) ||
                (!item.releasedAt &&
                  (!(kind === "job"
                    ? item.publicationAllowed
                    : item.consentedAt) ||
                    (kind === "profile" && !item.verified) ||
                    (kind === "job" && item.review !== "approved")))
              }
            >
              {item.releasedAt
                ? "Make private"
                : `Release ${kind === "job" ? "vacancy" : "profile"} publicly`}
            </button>
          </form>
        )}
      </article>
    ));
  }
  return (
    <>
      <LaunchAdministration />
      <section className="panel founding-admin">
        <p className="eyebrow">Founding launch</p>
        <h2>Registration and public release.</h2>
        <p>
          Businesses and agencies register directly and submit the normal
          verification form in their account. No separate founding-access
          approval or consultation is needed. Profiles and vacancies stay
          private until the public marketplace opens, the owner permits
          publication and Westmere releases each item.
        </p>
        {message && (
          <p role="status" className="notice">
            {message}
          </p>
        )}
        {!data ? (
          <p role="status">Loading launch controls…</p>
        ) : (
          <>
            <details open>
              <summary>
                Launch updates and earlier access requests ({data.requestCount})
              </summary>
              <p className="fineprint">
                Requests {offset + 1}–{offset + data.requests.length} of{" "}
                {data.requestCount}, including candidate launch-update requests.
                New employer and agency accounts register directly. A
                launch-update request is not an account or permission to join an
                ongoing newsletter.
              </p>
              {!data.requests.length && <p>No launch-update requests yet.</p>}
              {data.requests.map((r) => (
                <article key={r.id}>
                  <strong>
                    {r.business_name || r.name || "Candidate launch update"}
                  </strong>
                  <p>
                    {r.kind} · {r.status} · {r.email}
                  </p>
                  {r.vacancy_url && (
                    <a href={r.vacancy_url} target="_blank" rel="noreferrer">
                      Open supplied vacancy link
                    </a>
                  )}
                  <p className="fineprint">
                    Requested{" "}
                    {new Date(r.created_at).toLocaleDateString("en-AU")}
                  </p>
                  {r.kind !== "candidate" && (
                    <button
                      className="text-button"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(
                            `${window.location.origin}/launch/register${r.kind === "agency" ? "?kind=agency" : ""}`,
                          )
                          .then(
                            () => setMessage("Registration link copied."),
                            () =>
                              setMessage("Registration link: /launch/register"),
                          );
                      }}
                    >
                      Copy registration link
                    </button>
                  )}
                </article>
              ))}
              <div className="actions-row">
                <button
                  className="button secondary small"
                  disabled={busy || offset === 0}
                  onClick={() => setOffset((v) => Math.max(0, v - 100))}
                >
                  Previous requests
                </button>
                <button
                  className="button secondary small"
                  disabled={busy || offset + 100 >= data.requestCount}
                  onClick={() => setOffset((v) => v + 100)}
                >
                  Next requests
                </button>
              </div>
            </details>
            <details>
              <summary>Business profiles ({data.profiles.length})</summary>
              {!data.marketplaceOpen && (
                <p>
                  Verification can proceed as usual. Public release is disabled
                  while the founding site is active.
                </p>
              )}
              {content(data.profiles, "profile")}
            </details>
            <details>
              <summary>Vacancies ({data.jobs.length})</summary>
              <p>
                Inspect the full listing in the Listings review queue (include
                reviewed items), and check its accuracy before release. Release
                the business profile before its vacancy. Publication starts a
                fresh 30-day listing period.
              </p>
              {content(data.jobs, "job")}
            </details>
            {session.staffRole === "admin" && (
              <details>
                <summary>Public marketplace opening</summary>
                <p>
                  {data.marketplaceOpen
                    ? "Public job browsing and the employer directory are open. Only individually released content is visible."
                    : "Founding launch is active at /launch. Business registration and optional verified-business subscriptions are available. All business profiles and vacancies remain private; public browsing is closed."}
                </p>
                <form
                  onSubmit={(e) =>
                    void decide(
                      e,
                      "mode",
                      undefined,
                      undefined,
                      !data.marketplaceOpen,
                    )
                  }
                >
                  {reason()}
                  <label className="checkbox-label">
                    <input type="checkbox" required />I have checked service
                    readiness and intend to{" "}
                    {data.marketplaceOpen
                      ? "return to the founding launch"
                      : "open public job browsing and the employer directory"}
                    .
                  </label>
                  <button className="button secondary" disabled={busy}>
                    {data.marketplaceOpen
                      ? "Return to founding launch"
                      : "Open public marketplace"}
                  </button>
                </form>
              </details>
            )}
          </>
        )}
      </section>
    </>
  );
}
export function FoundingContent() {
  const session = useSession();
  const [data, setData] = useState<{
      profiles: Content[];
      jobs: Content[];
    } | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const r = await fetch("/api/employers/launch", {
        cache: "no-store",
        signal,
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      if (!signal?.aborted) setData(d);
    } catch (e) {
      if (!signal?.aborted)
        setMessage(
          e instanceof Error ? e.message : "Launch content unavailable.",
        );
    }
  }, []);
  useEffect(() => {
    const c = new AbortController();
    void load(c.signal);
    return () => c.abort();
  }, [load]);
  async function change(
    e: React.FormEvent<HTMLFormElement>,
    item: Content,
    kind: string,
  ) {
    e.preventDefault();
    setBusy(true);
    try {
      const d = await sendJson("/api/employers/launch", {
        id: item.id,
        kind,
        action: (
          kind === "business_jobs"
            ? item.jobsPublicationEnabled
            : kind === "job"
              ? item.publicationAllowed
              : item.consentedAt
        )
          ? "withdraw"
          : "consent",
      });
      setMessage(d.message);
      await load();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Permission could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  function list(items: Content[], kind: string) {
    return items.map((item) => (
      <article key={item.id}>
        <h3>{item.name || item.title}</h3>
        <p>
          {item.releasedAt && session.marketplaceOpen
            ? "Released publicly"
            : item.releasedAt
              ? "Private · public launch is closed"
              : (kind === "job" ? item.publicationAllowed : item.consentedAt)
                ? kind === "job" && !item.consentedAt
                  ? "Default publication enabled · awaiting Westmere’s release"
                  : "Permission recorded · awaiting Westmere’s release"
                : "Private · publication permission is off"}
          {item.review && ` · Review: ${item.review}`}
        </p>
        {item.owner && (
          <form onSubmit={(e) => void change(e, item, kind)}>
            {!(kind === "job" ? item.publicationAllowed : item.consentedAt) && (
              <label className="checkbox-label">
                <input type="checkbox" required />I approve this{" "}
                {kind === "job" ? "vacancy" : "business profile"} for public
                release after the public marketplace opens and Westmere’s
                review. I have checked it is current and authorised.
              </label>
            )}
            <button
              className="button secondary small"
              disabled={
                busy ||
                item.test ||
                (kind === "job" &&
                  !data?.profiles.find((p) => p.id === item.organisationId)
                    ?.jobsPublicationEnabled)
              }
            >
              {(kind === "job" ? item.publicationAllowed : item.consentedAt)
                ? "Withdraw permission and make private"
                : "Approve for launch"}
            </button>
          </form>
        )}
      </article>
    ));
  }
  return (
    <section className="panel founding-content">
      <p className="eyebrow">Your launch preparation</p>
      <h2>Choose what can become public.</h2>
      <p>
        Your business details and vacancies are not public during founding
        onboarding. They can only become public after the public marketplace
        opens and Westmere releases them. Job publication is enabled by default
        for each business. Turn it off below to keep that business’s current and
        future job listings private. You can also withdraw permission for an
        individual vacancy. Business profiles still need separate approval.
        Verification, payment and this preference do not bypass listing review.
        Content or document changes require Westmere to release the updated
        version again; your opt-out remains in place.
      </p>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {data ? (
        <>
          <h3>Job publication at launch</h3>
          {data.profiles.map((item) => (
            <article key={item.id}>
              <h4>{item.name}</h4>
              <p>
                {item.test
                  ? "Test business · public release remains blocked"
                  : item.jobsPublicationEnabled
                    ? "On by default · reviewed listings may be published after launch and Westmere’s release."
                    : "Off · this business’s current and future job listings remain private."}
              </p>
              {item.owner ? (
                <form onSubmit={(e) => void change(e, item, "business_jobs")}>
                  <button
                    type="submit"
                    className="button secondary small"
                    disabled={busy || item.test}
                    aria-label={`${item.jobsPublicationEnabled ? "Turn off" : "Enable"} job publication for ${item.name}`}
                  >
                    {item.jobsPublicationEnabled
                      ? "Turn off job publication"
                      : "Enable job publication"}
                  </button>
                </form>
              ) : (
                <p className="fineprint">
                  The business owner can change this preference.
                </p>
              )}
            </article>
          ))}
          <h3>Business profiles</h3>
          {list(data.profiles, "profile")}
          <h3>Vacancies</h3>
          {list(data.jobs, "job")}
          {!data.jobs.length && (
            <p>
              Prepare a vacancy in Roles. It will appear here when it is
              available to your account.
            </p>
          )}
        </>
      ) : (
        <p>Loading your launch preparation…</p>
      )}
    </section>
  );
}
