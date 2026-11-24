"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { launchPath } from "@/lib/launch-paths";
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
  organisationName?: string;
  publicationAllowed?: boolean;
  publicationOptedOut?: boolean;
  public?: boolean;
  hiddenAt?: string | null;
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
            : item.public
              ? "Public"
              : item.hiddenAt
                ? "Private · held by Westmere"
                : item.publicationAllowed
                  ? "Included by default · normal publication checks apply"
                  : item.status === "closed"
                    ? "Closed · not included at launch"
                    : "Private · business opted out"}
          {item.review && ` · Review: ${item.review}`}
        </p>
        {kind === "job" && (
          <p>
            Business: {item.organisationName}
            {data?.profiles.find(
              (profile) => profile.id === item.organisationId,
            )?.publicationAllowed === false &&
              " · private profile, listings hidden"}
          </p>
        )}
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
        {!item.test && (kind !== "job" || item.status !== "closed") && (
          <form
            onSubmit={(e) =>
              void decide(e, item.hiddenAt ? "release" : "hide", item.id, kind)
            }
          >
            {reason()}
            <button
              className="button secondary small"
              disabled={
                busy ||
                (kind === "profile" && !item.verified) ||
                (!!item.hiddenAt && !data?.marketplaceOpen) ||
                (!!item.hiddenAt &&
                  (!item.publicationAllowed ||
                    (kind === "job" &&
                      (item.review !== "approved" ||
                        !data?.profiles.find(
                          (profile) => profile.id === item.organisationId,
                        )?.public))))
              }
            >
              {item.hiddenAt
                ? `Restore ${kind === "job" ? "vacancy" : "profile"} visibility`
                : "Hold from public view"}
            </button>
          </form>
        )}
      </article>
    ));
  }
  const launchJobs =
    data?.jobs.filter((item) => item.publicationAllowed && !item.hiddenAt) ??
    [];
  return (
    <>
      <LaunchAdministration />
      <section className="panel founding-admin">
        <p className="eyebrow">Founding launch</p>
        <h2>Registration and public release.</h2>
        <p>
          Businesses and agencies register directly and submit the normal
          verification form in their account. No separate founding-access
          approval or consultation is needed. Verified business profiles and
          eligible reviewed vacancies are included at launch by default.
          Businesses can make each profile private in Profile or close
          individual roles in Launch preparation. A private profile hides all
          its listings.
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
            <details open>
              <summary>
                Vacancies included at launch ({launchJobs.length})
              </summary>
              <p>
                These roles are included by default or have been republished by
                the business. Review and plan limits still apply. Roles under a
                private business profile remain hidden until that profile is
                public.
              </p>
              {content(launchJobs, "job")}
              {!launchJobs.length && (
                <p>No vacancies are currently included at launch.</p>
              )}
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
              <summary>All vacancies ({data.jobs.length})</summary>
              <p>
                Inspect the full listing in the Listings review queue (include
                reviewed items), and check its accuracy. Closed roles are
                excluded from launch. Eligible roles receive a fresh 30-day
                listing period when first published at launch.
              </p>
              {content(data.jobs, "job")}
            </details>
            {session.staffRole === "admin" && (
              <details>
                <summary>Public marketplace opening</summary>
                <p>
                  {data.marketplaceOpen
                    ? "Public job browsing and the employer directory are open. Profile visibility, role status and review requirements control what is visible."
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
  } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/employers/launch", {
        cache: "no-store",
        signal,
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      if (!signal?.aborted) setData(result);
    } catch (error) {
      if (!signal?.aborted)
        setMessage(
          error instanceof Error
            ? error.message
            : "Launch preparation unavailable.",
        );
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  async function closeRole(
    event: React.FormEvent<HTMLFormElement>,
    item: Content,
  ) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await sendJson("/api/employers/launch", {
        kind: "job",
        id: item.id,
        action: "withdraw",
      });
      setMessage(result.message);
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "This role could not be closed.",
      );
    } finally {
      setBusy(false);
    }
  }
  const profilePath = launchPath(
    "/account?tab=profile",
    session.marketplaceOpen,
  );
  const rolesPath = launchPath("/account?tab=roles", session.marketplaceOpen);
  return (
    <section className="panel founding-content">
      <p className="eyebrow">Your launch preparation</p>
      <h2>Choose what appears at launch.</h2>
      <p>
        Your business profiles and vacancies remain private until the public
        marketplace opens. Verified business profiles and eligible reviewed
        roles are included at launch by default. Normal review, hiring authority
        and plan limits still apply; payment does not bypass these checks.
      </p>
      <h3>Business visibility</h3>
      <p>
        Choose Public or Private separately for each business in the Profile
        tab, before or after launch. Making a business private hides its profile
        and all its job listings without closing those roles. Making it public
        again restores listings that are still active. Roles closed or removed
        while the profile was private stay closed; expiry dates continue as
        usual.
      </p>
      <Link href={profilePath} className="button secondary small">
        Manage business visibility in Profile →
      </Link>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {data ? (
        <>
          {data.profiles.map((profile) => (
            <p key={profile.id}>
              <strong>{profile.name}</strong> ·{" "}
              {profile.publicationAllowed
                ? "Public visibility enabled"
                : "Private · all listings hidden"}
              {profile.hiddenAt ? " · held for Westmere review" : ""}
            </p>
          ))}
          <h3>Roles at launch</h3>
          <p>
            Keep the roles you want to advertise included below. Choose “Close
            and exclude from launch” for a role you do not want published. It
            moves to Closed in Roles and retains its applications and
            statistics. To include it again, use “Republish role” in Roles, just
            as you would for a vacancy closed after recruitment. A private
            business profile continues to hide its roles, even when they are
            included at launch.
          </p>
          {data.jobs.map((item) => (
            <article key={item.id}>
              <h4>{item.title}</h4>
              <p>{item.organisationName}</p>
              <p>
                {item.status === "closed"
                  ? "Closed · excluded from launch"
                  : item.hiddenAt
                    ? "Private · held for Westmere review"
                    : item.public
                      ? "Published"
                      : item.publicationAllowed
                        ? "Included at launch · subject to review and business visibility"
                        : "Excluded from launch"}
                {item.review && ` · Review: ${item.review}`}
              </p>
              {item.owner && item.status !== "closed" && (
                <form onSubmit={(event) => void closeRole(event, item)}>
                  <button
                    className="button secondary small"
                    disabled={busy || item.test}
                    aria-label={`Close ${item.title} and exclude from launch`}
                  >
                    Close and exclude from launch
                  </button>
                </form>
              )}
              {item.status === "closed" && (
                <Link href={rolesPath} className="text-link">
                  Manage closed role in Roles →
                </Link>
              )}
            </article>
          ))}
          {!data.jobs.length && (
            <p>
              Prepare a vacancy in Roles. It will appear here when it is
              available to your account.
            </p>
          )}
          <Link href={rolesPath} className="text-link">
            Manage roles →
          </Link>
        </>
      ) : (
        <p role="status">Loading your launch preparation…</p>
      )}
    </section>
  );
}
