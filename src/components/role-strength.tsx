"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Target, LoaderCircle, ArrowRight, FileText } from "lucide-react";
import { useSession } from "./providers";
import { SavedCVButton } from "./profile-tools";
import { SuggestionInput } from "./search-bar";
import type { AssistantAttachment } from "@/lib/assistant-attachments";
import type { RoleStrengthMatch } from "@/lib/role-strength";
type Result = {
  matches: RoleStrengthMatch[];
  recommendedRoles: { title: string; score: number; count: number }[];
  searchedCount: number;
  total: number;
  source: "live" | "demo";
  role: string;
};
export function RoleStrength({
  documents,
}: {
  documents: AssistantAttachment[];
}) {
  const session = useSession();
  const [role, setRole] = useState("");
  const [cvId, setCvId] = useState("");
  const [letterId, setLetterId] = useState("");
  const [savedCv, setSavedCv] = useState("");
  const [recommendations, setRecommendations] = useState<
    Result["recommendedRoles"]
  >([]);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [error, setError] = useState("");
  const selected =
    documents.find((file) => file.id === cvId) ||
    documents.find((file) => /\bcv\b|resume/i.test(file.filename)) ||
    documents[0];
  const cv = selected?.text || savedCv;
  const letter =
    documents.find((file) => file.id === letterId && file.id !== selected?.id)
      ?.text || "";
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    setResult(null);
    setError("");
    setRecommendations([]);
    setRecommending(false);
    request.current?.abort();
    request.current = null;
    setBusy(false);
    if (!session.isPremium || cv.length < 40) return;
    const controller = new AbortController();
    setRecommending(true);
    fetch("/api/jobs/role-strength", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ role: "", cv, coverLetter: letter }),
    })
      .then(async (response) => {
        const d = await response.json();
        if (!response.ok) throw Error(d.error);
        if (!controller.signal.aborted) setRecommendations(d.recommendedRoles);
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error
              ? e.message
              : "Recommendations could not be loaded.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setRecommending(false);
      });
    return () => controller.abort();
  }, [cv, letter, session.isPremium, session.business, session.user?.id]);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    request.current?.abort();
    setBusy(false);
    setSavedCv("");
    setResult(null);
  }, [session.user?.id]);
  async function compare(value = role) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/jobs/role-strength", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ role: value.trim(), cv, coverLetter: letter }),
      });
      const d = await response.json();
      if (!response.ok) throw Error(d.error);
      if (!controller.signal.aborted) setResult(d);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(
          e instanceof Error
            ? e.message
            : "This comparison could not be loaded.",
        );
    } finally {
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <section
      className="panel role-strength-section"
      aria-labelledby="role-strength-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Your next possibility</p>
          <h2 id="role-strength-title">
            <Target size={23} aria-hidden="true" /> Role Strength
          </h2>
        </div>
        <span className="badge">Careers+</span>
      </div>
      <p className="muted">
        Compare your CV with a position’s published requirements and skills. See
        the same document evidence score available to the hiring team when you
        apply.
      </p>
      {session.business && !session.isPremium ? (
        <p className="notice">
          Use a personal Careers+ account or subscribe to Enterprise on this
          billing account to explore Role Strength from a candidate’s
          perspective. Invited accounts do not inherit Careers+.{" "}
          <Link href="/account?tab=billing">Review Enterprise</Link>
        </p>
      ) : !session.isPremium ? (
        <p className="notice">
          {session.user
            ? "Role Strength is included with Careers+. "
            : "Sign in with a personal Careers+ account to compare roles. "}
          <Link href="/careers-plus">Explore Careers+</Link>
        </p>
      ) : (
        <>
          <div className="role-strength-documents">
            <p>
              <FileText size={16} aria-hidden="true" />
              {selected
                ? selected.filename
                : savedCv
                  ? "Your saved base CV"
                  : "Upload your CV in Westmere Assistant above, or use your saved base CV."}
            </p>
            {documents.length > 1 && (
              <>
                <label className="field-label">
                  CV to compare
                  <select
                    value={selected?.id || ""}
                    onChange={(e) => setCvId(e.target.value)}
                  >
                    {documents.map((file) => (
                      <option key={file.id} value={file.id}>
                        {file.filename}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  Cover letter · optional
                  <select
                    value={letterId}
                    onChange={(e) => setLetterId(e.target.value)}
                  >
                    <option value="">CV only</option>
                    {documents
                      .filter((file) => file.id !== selected?.id)
                      .map((file) => (
                        <option key={file.id} value={file.id}>
                          {file.filename}
                        </option>
                      ))}
                  </select>
                </label>
              </>
            )}
            {!documents.length && (
              <SavedCVButton onLoad={setSavedCv} maxLength={24000} />
            )}
          </div>
          <form
            className="role-strength-query"
            onSubmit={(e) => {
              e.preventDefault();
              void compare();
            }}
          >
            <SuggestionInput
              kind="job"
              label="Position type"
              value={role}
              onChange={setRole}
            />
            <button
              className="button primary"
              disabled={busy || role.trim().length < 2 || cv.length < 40}
            >
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Target size={17} />
              )}{" "}
              Compare roles
            </button>
          </form>
          {recommending && (
            <p className="fineprint" role="status">
              Finding position types with wording evidenced in your CV…
            </p>
          )}
          {recommendations.length > 0 && (
            <div className="role-strength-recommendations">
              <h3>Position types to explore</h3>
              <div>
                {recommendations.map((item) => (
                  <button
                    type="button"
                    className="button secondary small"
                    key={item.title}
                    disabled={busy}
                    onClick={() => {
                      setRole(item.title);
                      void compare(item.title);
                    }}
                  >
                    {item.title}
                    <ArrowRight size={14} />
                  </button>
                ))}
              </div>
              <p className="fineprint">
                Suggestions come from your CV wording and current vacancies.
              </p>
            </div>
          )}
          {error && (
            <p className="message" role="alert">
              {error}
            </p>
          )}
          {busy && (
            <p role="status">
              Comparing the published requirements across matching roles…
            </p>
          )}
          {result && (
            <div className="role-strength-results" aria-live="polite">
              <h3>
                Top {result.matches.length} matching{" "}
                {result.matches.length === 1 ? "role" : "roles"} · {result.role}
              </h3>
              <p className="fineprint">
                Compared {result.searchedCount.toLocaleString()} published
                roles.{" "}
                {result.source === "demo"
                  ? "Fictional sample inventory."
                  : "Current site inventory."}
              </p>
              {!result.matches.length && (
                <p>
                  No published roles match this position type. Try another title
                  from the suggestions.
                </p>
              )}
              <ol>
                {result.matches.map(({ job, measure }) => (
                  <li className="role-strength-result" key={job.id}>
                    <div>
                      <h4>
                        <Link href={`/jobs/${job.id}`}>{job.title}</Link>
                      </h4>
                      <p>
                        {job.company} · {job.location}
                      </p>
                    </div>
                    <div className="role-strength-score">
                      <strong>
                        {measure.score === null
                          ? "Not assessed"
                          : `${measure.score}/100`}
                      </strong>
                      <span>
                        {measure.evidenced}/{measure.total} criteria with
                        wording evidence
                      </span>
                    </div>
                    <details>
                      <summary>View requirements and sources</summary>
                      {measure.evidence.map((row, index) => (
                        <div key={index}>
                          <strong>{row.requirement}</strong>
                          <p>
                            {row.excluded
                              ? "Excluded sensitive criterion."
                              : row.excerpts.length
                                ? row.excerpts
                                    .map(
                                      (excerpt) =>
                                        `${excerpt.source}: ${excerpt.text}`,
                                    )
                                    .join("\n")
                                : "No matching wording located. Read the position description and check your evidence."}
                          </p>
                        </div>
                      ))}
                    </details>
                    <Link className="text-link" href={`/jobs/${job.id}`}>
                      Read position description <ArrowRight size={15} />
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}
      <p className="fineprint role-strength-explanation">
        The percentage counts eligible criteria with literal wording in the CV
        or cover letter. It can miss equivalent wording or include an irrelevant
        mention. It is a document comparison, not verified skills or a hiring
        prediction. Your submitted application may differ from this preview. No
        Assistant request is used, and this comparison is not sent to OpenAI.
      </p>
    </section>
  );
}
