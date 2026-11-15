"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowRight,
  Copy,
  FilePenLine,
  LoaderCircle,
  Sparkles,
  Target,
} from "lucide-react";
import type { StudioResult } from "@/lib/premium/contracts";
import type { Job } from "@/lib/jobs";
import { useSession } from "./providers";
import { useAssistantAllowance } from "./assistant-allowance";
import { SavedCVButton } from "./profile-tools";

export function CareerAssistant({ job }: { job?: Job }) {
  const session = useSession();
  const { allowance, error, refresh } = useAssistantAllowance();
  const [mode, setMode] = useState<"improve" | "tailor">("improve");
  const [cv, setCv] = useState("");
  const [description, setDescription] = useState(
    job
      ? [job.description, ...job.responsibilities, ...job.requirements].join(
          "\n",
        )
      : "",
  );
  const [consent, setConsent] = useState(false);
  const [result, setResult] = useState<StudioResult | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const owner = useRef(session.user?.id);
  const id = useId();
  useEffect(() => {
    if (owner.current && owner.current !== session.user?.id) {
      request.current?.abort();
      setCv("");
      setResult(null);
      setConsent(false);
      setMessage("");
      setBusy(false);
    }
    owner.current = session.user?.id;
  }, [session.user?.id]);
  useEffect(() => () => request.current?.abort(), []);
  async function generate(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch(
        session.isPremium ? "/api/studio" : "/api/assistant",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            mode,
            cv,
            consent,
            ...(mode === "tailor"
              ? { jobDescription: description, jobTitle: job?.title || "" }
              : {}),
          }),
        },
      );
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok)
        throw new Error(data.error || "The review could not be completed.");
      setResult(data.result);
      setMessage("Your review is ready. Check every fact before using it.");
    } catch (cause) {
      if (!controller.signal.aborted)
        setMessage(
          cause instanceof Error
            ? cause.message
            : "Your draft is still here. Please try again.",
        );
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
        request.current = null;
        await refresh();
      }
    }
  }
  const used = allowance?.remaining === 0;
  return (
    <aside
      className="career-assistant"
      id="career-assistant"
      aria-labelledby={`${id}-title`}
    >
      <div className="assistant-heading">
        <span>
          <Sparkles size={18} />
          Westmere assistant
        </span>
        <small>{allowance?.tier || "AI guidance"}</small>
      </div>
      <h2 id={`${id}-title`}>
        Your experience,
        <br />
        in focus.
      </h2>
      <p className="assistant-intro">
        A little help with your CV or your next application. You choose what to
        share.
      </p>
      <div className="assistant-tools" aria-label="Choose an assistant task">
        <button
          type="button"
          aria-pressed={mode === "improve"}
          onClick={() => {
            setMode("improve");
            setConsent(false);
          }}
        >
          <FilePenLine size={16} />
          Improve my CV
        </button>
        <button
          type="button"
          aria-pressed={mode === "tailor"}
          onClick={() => {
            setMode("tailor");
            setConsent(false);
          }}
        >
          <Target size={16} />
          Tailor to {job ? "this role" : "a role"}
        </button>
      </div>
      <form onSubmit={generate}>
        <label className="field-label" htmlFor={`${id}-cv`}>
          Your CV text
        </label>
        <textarea
          id={`${id}-cv`}
          minLength={100}
          maxLength={24000}
          required
          autoComplete="off"
          value={cv}
          placeholder="Paste the experience you’d like help expressing…"
          onChange={(event) => {
            setCv(event.target.value);
            setConsent(false);
          }}
        />
        <SavedCVButton
          maxLength={24000}
          onLoad={(text) => {
            setCv(text);
            setConsent(false);
          }}
        />
        {mode === "tailor" && (
          <>
            <label className="field-label" htmlFor={`${id}-role`}>
              {job ? job.title : "Job description"}
            </label>
            <textarea
              id={`${id}-role`}
              minLength={50}
              maxLength={16000}
              required
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                setConsent(false);
              }}
              placeholder="Paste the role’s responsibilities and requirements…"
            />
          </>
        )}
        <label className="assistant-consent">
          <input
            type="checkbox"
            required
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />
          <span>
            I agree to send this text to OpenAI for this review. I’ll remove
            unnecessary sensitive details and check the suggestions.
          </span>
        </label>
        <div className="assistant-allowance">
          <span>
            {allowance?.tier === "Careers+"
              ? "This billing period"
              : allowance?.tier === "Free account"
                ? "Your account reviews"
                : "Your free preview"}
          </span>
          <strong>
            {allowance
              ? `${allowance.remaining} ${allowance.remaining === 1 ? "use" : "uses"} left`
              : "—"}
          </strong>
        </div>
        {!used && (
          <button
            className="button purple full"
            type="submit"
            disabled={busy || !allowance}
          >
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <Sparkles size={16} />
            )}
            {busy ? "Preparing your review…" : "Review my CV"}
          </button>
        )}
        {used && !session.user && (
          <button
            className="button purple full"
            type="button"
            onClick={session.openAuth}
          >
            Sign in for 3 more free uses <ArrowRight size={16} />
          </button>
        )}
        {used && session.user && !session.isPremium && (
          <Link className="button purple full" href="/careers-plus">
            Explore Careers+ <ArrowRight size={16} />
          </Link>
        )}
        {used && session.isPremium && (
          <p className="fineprint">
            Your allowance renews{" "}
            {allowance?.renewsAt
              ? new Date(allowance.renewsAt).toLocaleDateString("en-AU")
              : "with your next billing period"}
            . Your existing result stays available.
          </p>
        )}
      </form>
      {error && (
        <p className="assistant-message" role="status">
          {error}{" "}
          <Link href="/studio">Explore the editor and static example.</Link>
        </p>
      )}
      {message && (
        <p className="assistant-message" role="status">
          {message}
        </p>
      )}
      {result && (
        <section className="assistant-result" aria-label="Your AI review">
          <h3>A little more clarity.</h3>
          <p>{result.summary}</p>
          <ul>
            {result.improvements.slice(0, 5).map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
          <details>
            <summary>
              Your reviewed CV{result.coverLetter ? " & cover letter" : ""}
            </summary>
            <textarea
              aria-label="Reviewed CV"
              readOnly
              value={
                result.revisedCv +
                (result.coverLetter
                  ? `\n\nCOVER LETTER\n${result.coverLetter}`
                  : "")
              }
            />
            <button
              className="text-button"
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    result.revisedCv +
                      (result.coverLetter ? `\n\n${result.coverLetter}` : ""),
                  );
                  setMessage("Copied. Review every fact before using it.");
                } catch {
                  setMessage(
                    "Select the text above and copy it from your browser.",
                  );
                }
              }}
            >
              <Copy size={14} />
              Copy review
            </button>
          </details>
        </section>
      )}
      <p className="assistant-privacy">
        One guest review on this browser, then three additional reviews with a
        verified free account. Careers+ includes 30 requests per billing period.
        Failed requests return your allowance; daily preview limits also apply.{" "}
        <Link href="/privacy">Your privacy</Link>
      </p>
      <Link
        className="text-link assistant-studio-link"
        href={job ? `/studio?job=${job.id}` : "/studio"}
      >
        Open the full Application Studio <ArrowRight size={14} />
      </Link>
    </aside>
  );
}
