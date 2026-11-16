"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowUp,
  Copy,
  FileCheck2,
  FilePenLine,
  LoaderCircle,
  MessageCircle,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Sparkles,
  Target,
  Upload,
} from "lucide-react";
import {
  cvReadinessScore,
  studioReviewText,
  type StudioRequest,
  type StudioResult,
} from "@/lib/premium/contracts";
import type { Job } from "@/lib/jobs";
import { useSession } from "./providers";
import { useNotice, individualNotice } from "./notices";
import { useAssistantAllowance } from "./assistant-allowance";
import { SavedCVButton } from "./profile-tools";
export async function extractCv(file: File, signal?: AbortSignal) {
  const body = new FormData();
  body.set("file", file);
  const r = await fetch("/api/assistant/document", {
    method: "POST",
    body,
    signal,
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "The document could not be read.");
  return d as { text: string; filename: string; message: string };
}
export function CvScore({ result }: { result: StudioResult }) {
  const review = result.review;
  if (!review) return null;
  const score = cvReadinessScore(review);
  return (
    <section
      className="cv-score-report"
      aria-label="CV document readiness review"
    >
      <div className="score-heading">
        <div>
          <p className="eyebrow">
            CV review · {review.intendedField || "General document review"}
          </p>
          <h3>
            {score === null
              ? "More CV evidence needed"
              : "Your CV, with a clearer direction."}
          </h3>
        </div>
        {score !== null && (
          <strong className="cv-score">
            {score}
            <small>/100</small>
          </strong>
        )}
      </div>
      <p>{review.explanation}</p>
      {review.criteria.map((c) => (
        <div key={c.criterion} className="score-criterion">
          <div>
            <strong>
              {
                {
                  clarity: "Clarity",
                  structure: "Structure",
                  evidence: "Evidence & achievements",
                  skills: "Skills",
                  roleAlignment: "Field alignment",
                }[c.criterion]
              }
            </strong>
            <span>{c.points}/20</span>
          </div>
          <progress max={20} value={c.points} />
          <p>{c.feedback}</p>
        </div>
      ))}
      <p className="fineprint">
        An approximate AI review of this document against five writing criteria.
        It is not an ATS score, a comparison with other applicants or a
        prediction of hiring success. Review suggestions for accuracy.
      </p>
    </section>
  );
}
type Entry = {
  role: "user" | "assistant";
  text: string;
  result?: StudioResult;
};
export function CareerChat({
  job,
  cv: externalCv,
  onCvChange,
  onResult,
}: {
  job?: Job;
  cv?: string;
  onCvChange?: (text: string) => void;
  onResult?: (result: StudioResult) => void;
}) {
  const session = useSession(),
    notice = useNotice();
  const { allowance, error, refresh } = useAssistantAllowance();
  const [mode, setMode] = useState<StudioRequest["mode"]>("review");
  const [localCv, setLocalCv] = useState(""),
    [goal, setGoal] = useState(""),
    [description, setDescription] = useState(
      job
        ? [job.description, ...job.requirements, ...job.responsibilities].join(
            "\n",
          )
        : "",
    ),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [filename, setFilename] = useState(""),
    [entries, setEntries] = useState<Entry[]>([]);
  const cv = externalCv ?? localCv;
  const setCv = (value: string) => {
    onCvChange?.(value);
    setLocalCv(value);
    setConsent(false);
  };
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null),
    request = useRef<AbortController | null>(null),
    owner = useRef(session.user?.id);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (owner.current && owner.current !== session.user?.id) {
      request.current?.abort();
      setLocalCv("");
      setEntries([]);
      setConsent(false);
      setFilename("");
      setBusy(false);
      setGoal("");
    }
    owner.current = session.user?.id;
  }, [session.user?.id]);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    log.current?.scrollTo({
      top: log.current.scrollHeight,
      behavior: "smooth",
    });
  }, [entries, busy]);
  function permitted() {
    if (session.business) {
      notice(individualNotice);
      return false;
    }
    return true;
  }
  async function upload(file: File) {
    if (!permitted()) return;
    const c = new AbortController();
    request.current = c;
    setBusy(true);
    try {
      const d = await extractCv(file, c.signal);
      if (c.signal.aborted) return;
      setCv(d.text);
      setFilename(d.filename);
      setEntries((e) => [
        ...e,
        { role: "user", text: `Attached ${d.filename}` },
        { role: "assistant", text: d.message },
      ]);
    } catch (e) {
      if (!c.signal.aborted)
        notice({
          title: "CV upload",
          message: e instanceof Error ? e.message : "Please retry.",
          tone: "error",
        });
    } finally {
      if (!c.signal.aborted) {
        setBusy(false);
        request.current = null;
      }
    }
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !permitted()) return;
    if (!allowance) {
      notice({
        title: "AI assistance",
        message:
          error || "Your allowance is loading. Please try again shortly.",
      });
      return;
    }
    if (allowance.remaining === 0) {
      notice({
        title: "Your available reviews are used",
        message: session.isPremium
          ? `Your allowance renews ${allowance.renewsAt ? new Date(allowance.renewsAt).toLocaleDateString("en-AU") : "with your next billing period"}. Your existing review stays here.`
          : session.user
            ? "Explore Careers+ for 30 requests per billing period."
            : "Sign in for three additional free reviews.",
        ...(!session.isPremium && session.user
          ? { href: "/careers-plus", label: "Explore Careers+" }
          : {}),
      });
      if (!session.user) session.openAuth();
      return;
    }
    const c = new AbortController();
    request.current = c;
    setBusy(true);
    const task = {
      review: "Review my CV",
      improve: "Improve my CV",
      tailor: "Tailor my CV and draft a cover letter",
      match: "Compare my CV with the role",
    }[mode];
    setEntries((items) => [
      ...items,
      { role: "user", text: `${task}${goal ? `: ${goal}` : ""}` },
    ]);
    try {
      const r = await fetch(
        session.isPremium ? "/api/studio" : "/api/assistant",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: c.signal,
          body: JSON.stringify({
            mode,
            cv,
            goals: goal,
            consent,
            ...(["tailor", "match"].includes(mode)
              ? { jobDescription: description, jobTitle: job?.title || "" }
              : {}),
          }),
        },
      );
      const d = await r.json();
      if (c.signal.aborted) return;
      if (!r.ok) throw Error(d.error || "The review could not be completed.");
      setEntries((items) => [
        ...items,
        { role: "assistant", text: d.result.summary, result: d.result },
      ]);
      setGoal("");
      onResult?.(d.result);
    } catch (e) {
      if (!c.signal.aborted)
        notice({
          title: "Your review",
          message: e instanceof Error ? e.message : "Please try again.",
          tone: "error",
        });
    } finally {
      if (!c.signal.aborted) {
        setBusy(false);
        request.current = null;
        await refresh();
      }
    }
  }
  return (
    <div className="career-chat">
      <div
        className="chat-log"
        ref={log}
        role="log"
        aria-label="Career preparation conversation"
        aria-live="polite"
      >
        <div className="chat-bubble assistant-bubble">
          <span className="chat-avatar">
            <Sparkles size={19} />
          </span>
          <p>
            Hi, I’m the Westmere assistant. Let’s make your next step a little
            clearer. Upload or paste your CV, choose a task and tell me what
            you’d like to focus on.
          </p>
        </div>
        <div className="chat-task-buttons">
          {(
            [
              { mode: "review", text: "Review my CV", icon: FileCheck2 },
              { mode: "improve", text: "Improve my CV", icon: FilePenLine },
              {
                mode: "tailor",
                text: "Draft a tailored cover letter",
                icon: Target,
              },
              { mode: "match", text: "Compare with a role", icon: Target },
            ] as const
          ).map((t) => (
            <button
              type="button"
              aria-pressed={mode === t.mode}
              key={t.mode}
              onClick={() => {
                if (permitted()) {
                  setMode(t.mode);
                  setConsent(false);
                }
              }}
            >
              <t.icon size={17} />
              {t.text}
            </button>
          ))}
        </div>
        {entries.map((e, i) => (
          <div
            key={i}
            className={`chat-bubble ${e.role === "user" ? "user-bubble" : "assistant-bubble"}`}
          >
            <p>{e.text}</p>
            {e.result && (
              <>
                <CvScore result={e.result} />
                <ul>
                  {e.result.improvements.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="text-button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        studioReviewText(e.result!),
                      );
                      notice({
                        title: "Review copied",
                        message:
                          "Your review includes the rubric, limitations and suggestions. Check its accuracy before using it.",
                      });
                    } catch {
                      notice({
                        title: "Copy review",
                        message: "Select and copy the review text above.",
                      });
                    }
                  }}
                >
                  <Copy size={15} />
                  Copy review report
                </button>
                {(e.result.revisedCv || e.result.coverLetter) && (
                  <details>
                    <summary>View draft</summary>
                    <textarea
                      readOnly
                      aria-label="Generated draft"
                      value={e.result.revisedCv + "\n\n" + e.result.coverLetter}
                    />
                    <button
                      type="button"
                      className="text-button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            e.result!.revisedCv +
                              "\n\n" +
                              e.result!.coverLetter,
                          );
                          notice({
                            title: "Draft copied",
                            message: "Check every fact before using it.",
                          });
                        } catch {
                          notice({
                            title: "Copy draft",
                            message: "Select and copy the draft text above.",
                          });
                        }
                      }}
                    >
                      <Copy size={15} />
                      Copy
                    </button>
                  </details>
                )}
              </>
            )}
          </div>
        ))}
        {busy && (
          <p className="chat-bubble assistant-bubble" role="status">
            <LoaderCircle size={16} className="spin" /> Preparing your next
            step…
          </p>
        )}
      </div>
      <form className="chat-composer" onSubmit={send}>
        <div className="chat-upload-row">
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="text-button"
            disabled={busy}
            onClick={() => {
              if (permitted()) fileRef.current?.click();
            }}
          >
            <Upload size={16} />
            {filename || "Attach CV · PDF, DOCX or TXT"}
          </button>
          <button
            type="button"
            className="icon-button"
            title="New conversation"
            aria-label="Clear conversation"
            disabled={busy}
            onClick={() => {
              setEntries([]);
              setCv("");
              setFilename("");
              setGoal("");
            }}
          >
            <Plus size={16} />
          </button>
        </div>
        <details className="chat-source" open={!cv && entries.length > 0}>
          <summary>
            {cv
              ? `${cv.length.toLocaleString()} characters · review source text`
              : "Paste or review your CV text"}
          </summary>
          <label className="field-label" htmlFor={`${id}-cv`}>
            CV text
          </label>
          <textarea
            id={`${id}-cv`}
            minLength={100}
            maxLength={24000}
            value={cv}
            onFocus={() => {
              if (session.business) notice(individualNotice);
            }}
            onChange={(e) => {
              if (permitted()) setCv(e.target.value);
            }}
          />
          {!session.business && (
            <SavedCVButton maxLength={24000} onLoad={setCv} />
          )}
        </details>
        {["tailor", "match"].includes(mode) && (
          <label className="field-label">
            Job description
            <textarea
              required
              minLength={50}
              maxLength={16000}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setConsent(false);
              }}
            />
          </label>
        )}
        <label className="sr-only" htmlFor={`${id}-goal`}>
          Focus or follow-up instructions
        </label>
        <div className="chat-input">
          <textarea
            id={`${id}-goal`}
            placeholder="Which field or improvements should we focus on?"
            maxLength={2000}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
          <button
            type="submit"
            className="icon-button"
            aria-label="Send career request"
            disabled={busy}
          >
            <ArrowUp size={21} />
          </button>
        </div>
        <label className="assistant-consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => {
              if (permitted()) setConsent(e.target.checked);
            }}
          />
          <span>
            I agree to send this CV text and my instructions to OpenAI for this
            request. I’ll remove unnecessary sensitive details and review the
            output.
          </span>
        </label>
        <p className="fineprint">
          {session.business
            ? "Personal account required"
            : allowance
              ? `${allowance.remaining} of ${allowance.cap} uses available · ${allowance.tier}`
              : error || "Loading your allowance…"}
          . Each request uses one review. Files are extracted temporarily; chat
          stays in this page session. <Link href="/privacy">Your privacy</Link>
        </p>
      </form>
    </div>
  );
}
export function CareerAssistant({ job }: { job?: Job }) {
  const [closed, setClosed] = useState(false);
  return (
    <aside
      className={`career-assistant ${closed ? "assistant-is-collapsed" : ""}`}
      id="career-assistant"
      aria-label="Westmere assistant"
    >
      <div className="assistant-heading dot-surface">
        <span>
          <MessageCircle size={18} />
          {!closed && "Westmere assistant"}
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label={
            closed ? "Open Westmere assistant" : "Close Westmere assistant"
          }
          aria-expanded={!closed}
          onClick={() => setClosed(!closed)}
        >
          {closed ? (
            <PanelRightOpen size={19} />
          ) : (
            <PanelRightClose size={19} />
          )}
        </button>
      </div>
      <div hidden={closed}>
        <CareerChat job={job} />
      </div>
    </aside>
  );
}
