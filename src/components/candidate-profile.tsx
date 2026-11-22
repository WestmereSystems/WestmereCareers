"use client";
import { useEffect, useState } from "react";
import { Check, Pencil, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useSession } from "./providers";
import { CVHistory, ChangeEmail } from "./profile-tools";
import {
  profileLinkNames,
  safeProfileLinks,
  type CandidateProfile,
} from "@/lib/candidate-profile";
export function CandidateProfileCard() {
  const session = useSession();
  const [profile, setProfile] = useState<CandidateProfile | null>(null),
    [draft, setDraft] = useState<CandidateProfile | null>(null),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/profile", { cache: "no-store", signal: c.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (!c.signal.aborted) {
          const p = {
            ...d.profile,
            email: d.user?.email,
            social_links: safeProfileLinks(d.profile?.social_links),
          };
          setProfile(p);
          setDraft(p);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setMessage(e.message);
      });
    return () => c.abort();
  }, [session.user?.id, session.user?.email]);
  return (
    <>
      <section className="panel candidate-profile-card">
        <div className="section-heading">
          <h2>Your Profile</h2>
          <button
            type="button"
            className="button secondary small"
            disabled={!profile || busy}
            onClick={() => {
              setDraft(profile);
              setEditing((v) => !v);
              setMessage("");
            }}
          >
            <Pencil size={16} />
            {editing ? "Cancel editing" : "Edit Profile"}
          </button>
        </div>
        {!profile && !message && (
          <p role="status">Loading your profile details…</p>
        )}
        {profile && !editing && (
          <dl className="candidate-profile-fields">
            <div>
              <dt>First name</dt>
              <dd>{profile.first_name || "Not provided"}</dd>
            </div>
            <div>
              <dt>Last name</dt>
              <dd>{profile.last_name || "Not provided"}</dd>
            </div>
            <div>
              <dt>Email address</dt>
              <dd>{profile.email}</dd>
            </div>
            {Object.entries(profileLinkNames).map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>
                  {profile.social_links[key] ? (
                    <a
                      href={profile.social_links[key]}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {profile.social_links[key]}
                    </a>
                  ) : (
                    "Not added"
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {editing && draft && (
          <>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  const r = await fetch("/api/profile", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      firstName: draft.first_name,
                      lastName: draft.last_name,
                      socialLinks: draft.social_links,
                    }),
                  });
                  const d = await r.json();
                  if (!r.ok) throw Error(d.error);
                  setProfile({
                    ...draft,
                    full_name: [draft.first_name, draft.last_name]
                      .filter(Boolean)
                      .join(" "),
                  });
                  setEditing(false);
                  setMessage(d.message);
                  await session.refresh();
                } catch (e) {
                  setMessage(
                    e instanceof Error
                      ? e.message
                      : "Profile could not be saved.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="account-grid">
                <label className="field-label">
                  First name
                  <input
                    autoComplete="given-name"
                    required
                    maxLength={120}
                    value={draft.first_name}
                    onChange={(e) =>
                      setDraft({ ...draft, first_name: e.target.value })
                    }
                  />
                </label>
                <label className="field-label">
                  Last name
                  <input
                    autoComplete="family-name"
                    maxLength={120}
                    value={draft.last_name}
                    onChange={(e) =>
                      setDraft({ ...draft, last_name: e.target.value })
                    }
                  />
                </label>
              </div>
              {Object.entries(profileLinkNames).map(([key, label]) => (
                <label className="field-label" key={key}>
                  {label} · optional
                  <input
                    type="url"
                    placeholder="https://"
                    pattern="https://.*"
                    maxLength={500}
                    value={draft.social_links[key] || ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        social_links: {
                          ...draft.social_links,
                          [key]: e.target.value,
                        },
                      })
                    }
                  />
                </label>
              ))}
              <button className="button primary" disabled={busy}>
                <Check size={16} />
                {busy ? "Saving…" : "Save profile details"}
              </button>
            </form>
            <div className="profile-email-editor">
              <p>Email address: {profile?.email}</p>
              <ChangeEmail />
            </div>
          </>
        )}
        <div className="profile-privacy-banner">
          <ShieldCheck size={23} />
          <div>
            <strong>Private by default</strong>
            <p>
              Your profile is shared only with employers you apply to. Your
              name, email and links stay current; submitted documents stay as
              they were when sent.{" "}
              <Link href="/privacy">How we handle your data</Link>
            </p>
          </div>
        </div>
        {message && (
          <p role="status" className="message">
            {message}
          </p>
        )}
      </section>
      <CVHistory onSelect={() => {}} />
    </>
  );
}
export function ApplicationProfileSummary({
  profile,
  audience = "candidate",
}: {
  profile: CandidateProfile;
  audience?: "candidate" | "employer";
}) {
  const links = safeProfileLinks(profile.social_links);
  return (
    <div className="application-profile-summary">
      <h3>
        {audience === "employer"
          ? "Candidate profile details"
          : "Your profile details"}
      </h3>
      <p>
        <strong>
          {profile.full_name ||
            [profile.first_name, profile.last_name].filter(Boolean).join(" ")}
        </strong>
        <br />
        {profile.email}
      </p>
      {Object.entries(profileLinkNames).map(([key, label]) =>
        links[key] ? (
          <p key={key}>
            {label}:{" "}
            <a href={links[key]} target="_blank" rel="noopener noreferrer">
              {links[key]}
            </a>
          </p>
        ) : null,
      )}
      <p className="fineprint">
        {audience === "employer"
          ? "Current candidate contact details and professional links. Documents and declarations are fixed at submission."
          : "Your hiring employer can see your current name, email and profile links while this application remains active. Documents and declarations are fixed at submission."}
      </p>
    </div>
  );
}
