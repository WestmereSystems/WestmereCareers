"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  Copy,
  Download,
  FilePenLine,
  FileText,
  Layers3,
  Leaf,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  Upload,
  X,
} from "lucide-react";
import { useSession } from "@/components/providers";
import type { Job } from "@/lib/jobs";
import type { StudioResult } from "@/lib/premium/contracts";

async function billingRedirect(
  endpoint: "checkout" | "portal",
  signal: AbortSignal,
) {
  const response = await fetch(`/api/billing/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    signal,
  });
  const data = await response.json();
  if (signal.aborted) return;
  if (!response.ok)
    throw new Error(
      data.error || "Billing is temporarily unavailable. Please try again.",
    );
  if (typeof data.url !== "string")
    throw new Error("Billing is temporarily unavailable. Please try again.");
  const destination = new URL(data.url);
  if (
    destination.protocol !== "https:" ||
    !(
      destination.hostname === "stripe.com" ||
      destination.hostname.endsWith(".stripe.com")
    )
  )
    throw new Error(
      "The billing destination could not be verified. Please try again later.",
    );
  window.location.assign(destination.href);
}

export function CareersPlus({
  checkoutStatus,
}: {
  checkoutStatus?: "complete" | "canceled";
}) {
  const session = useSession();
  return (
    <CareersPlusContent
      key={session.user?.id ?? "signedout"}
      checkoutStatus={checkoutStatus}
    />
  );
}

function CareersPlusContent({
  checkoutStatus,
}: {
  checkoutStatus?: "complete" | "canceled";
}) {
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const billingRequest = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      billingRequest.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (checkoutStatus === "complete") {
      setMessage(
        "Thanks for completing Checkout. Your access appears here once your subscription is confirmed.",
      );
      void session.refresh();
    } else if (checkoutStatus === "canceled")
      setMessage(
        "Checkout was closed. You can continue exploring Westmere for free.",
      );
  }, [checkoutStatus, session.refresh]);
  async function billing(kind: "checkout" | "portal") {
    if (billingRequest.current) return;
    if (!session.configured) {
      setMessage(
        "Subscriptions are being prepared. You can explore the studio’s static example while we finish connecting the service.",
      );
      return;
    }
    if (!session.user) {
      session.openAuth();
      return;
    }
    const controller = new AbortController();
    billingRequest.current = controller;
    setBusy(true);
    setMessage("");
    try {
      await billingRedirect(kind, controller.signal);
    } catch (error) {
      if (!controller.signal.aborted)
        setMessage(
          error instanceof Error
            ? error.message
            : "Billing is temporarily unavailable.",
        );
    } finally {
      if (!controller.signal.aborted) {
        billingRequest.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <main id="main">
      <section className="pricing-hero container">
        <div className="plus-wordmark">
          <Sparkles size={19} aria-hidden="true" />
          Careers<span>+</span>
        </div>
        <h1>
          Your experience.
          <br />A little more possibility.
        </h1>
        <p>
          You’ve done the work. Let’s make your strengths easier to see—with
          thoughtful CV guidance and applications that sound like you.
        </p>
        <Link
          className="text-link"
          href="/studio"
          style={{ justifyContent: "center" }}
        >
          Take a look inside the studio
          <ArrowRight size={17} />
        </Link>
      </section>
      <div className="container pricing-grid">
        <section
          aria-label="What Careers+ helps you do"
          className="feature-list"
        >
          <article className="feature-item">
            <span
              className="round-icon"
              style={{
                flexShrink: 0,
                background: "var(--lilac)",
                color: "var(--purple)",
              }}
            >
              <FilePenLine size={23} />
            </span>
            <div>
              <h3>Find the clearest way to say it.</h3>
              <p>
                Get personal suggestions for your CV’s structure, wording and
                emphasis. Build on the experience you already have, without
                adding claims you can’t support.
              </p>
            </div>
          </article>
          <article className="feature-item">
            <span
              className="round-icon"
              style={{
                flexShrink: 0,
                background: "var(--lilac)",
                color: "var(--purple)",
              }}
            >
              <Target size={23} />
            </span>
            <div>
              <h3>A thoughtful application for this role.</h3>
              <p>
                Bring a job description into the studio. Tailor your CV and
                draft a cover letter around relevant evidence, then review and
                edit every word before using it.
              </p>
            </div>
          </article>
          <article className="feature-item">
            <span
              className="round-icon"
              style={{
                flexShrink: 0,
                background: "var(--lilac)",
                color: "var(--purple)",
              }}
            >
              <Layers3 size={23} />
            </span>
            <div>
              <h3>A clearer starting point for your search.</h3>
              <p>
                Filter roles by skills evidenced in your CV. See what matches,
                keep the reasoning in view and explore roles that make sense for
                your next step.
              </p>
            </div>
          </article>
          <div
            className="notice"
            style={{ display: "flex", alignItems: "start", gap: 12 }}
          >
            <ShieldCheck
              size={22}
              style={{ flexShrink: 0, color: "var(--primary)" }}
            />
            <p>
              Your CV stays in the editor until you choose to use a connected
              feature. You decide when to share it with OpenAI, and you remain
              in control of what you apply with.
            </p>
          </div>
        </section>
        <aside className="price-card">
          <span className="badge purple">
            <Sparkles size={13} />
            Your application studio
          </span>
          <div className="price-value">
            A$25<span> / month</span>
          </div>
          <p className="fineprint">
            Billed monthly. Renews monthly until canceled.
            <br />
            GST included where applicable. No annual commitment.
          </p>
          <ul className="check-list">
            <li>
              <Check />
              30 CV studio requests per billing month
            </li>
            <li>
              <Check />
              General improvements and role-specific tailoring
            </li>
            <li>
              <Check />
              Editable CV and cover letter drafts
            </li>
            <li>
              <Check />
              CV skill-match filters while you browse
            </li>
            <li>
              <Check />
              Copy and download your reviewed text
            </li>
            <li>
              <Check />
              Cancel online through Manage billing
            </li>
          </ul>
          {session.isPremium ? (
            <Link href="/studio" className="button purple">
              Open your studio
              <ArrowRight size={17} />
            </Link>
          ) : (
            <button
              className="button purple"
              disabled={busy}
              onClick={() => void billing("checkout")}
            >
              {busy ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <Sparkles size={17} />
              )}
              Start Careers+
              <ArrowRight size={17} />
            </button>
          )}
          <Link href="/studio" className="button secondary">
            Explore the static example
            <ArrowUpRight size={16} />
          </Link>
          {session.user && (
            <button
              className="text-button"
              style={{ marginTop: 16 }}
              disabled={busy}
              onClick={() => void billing("portal")}
            >
              Manage billing
            </button>
          )}
          <p className="fineprint">
            Search, applications and employer response insights stay free.
            Careers+ supports your preparation; it does not buy hiring priority
            or guarantee interviews.
          </p>
          {message && (
            <div className="message" role="status">
              {message}
              {checkoutStatus === "complete" && !session.isPremium && (
                <button
                  type="button"
                  className="text-button"
                  style={{ display: "flex", gap: 6, marginTop: 10 }}
                  onClick={() => void session.refresh()}
                >
                  <RefreshCw size={13} />
                  Check subscription again
                </button>
              )}
            </div>
          )}
        </aside>
      </div>
      <section className="container" style={{ paddingBottom: 65 }}>
        <div
          className="panel"
          style={{
            display: "flex",
            gap: 22,
            alignItems: "center",
            flexWrap: "wrap",
            background: "var(--soft)",
          }}
        >
          <Leaf size={30} color="var(--primary)" style={{ flexShrink: 0 }} />
          <div style={{ flex: "1 1 290px" }}>
            <h2 style={{ fontSize: 24, marginBottom: 8 }}>
              A little support for your next chapter.
            </h2>
            <p className="fineprint">
              Every suggestion is a starting point. Keep your voice, check the
              facts and choose what feels right for the work you want.
            </p>
          </div>
          <Link href="/jobs" className="button secondary">
            Keep exploring roles
            <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </main>
  );
}

const sampleCv = `Alex Morgan
Product Designer · Melbourne

SUMMARY
Product designer with experience researching and redesigning digital onboarding journeys.

EXPERIENCE
Product Designer — Example Studio
2022–2026
• Worked with product and engineering to redesign onboarding using usability findings.
• Built Figma prototypes and ran usability sessions with customers.
• Documented interaction decisions and checked designs for accessibility.

SKILLS
Figma, user research, prototyping, interaction design, accessibility.`;

const sampleResult: StudioResult = {
  summary:
    "Bring the clearest evidence of your product design work closer to the top, and use direct language to describe your contribution.",
  improvements: [
    "Lead with your onboarding and research experience so a reader quickly understands your focus.",
    "Use direct verbs and retain the collaboration with product and engineering.",
    "Add a measurable result only when you have evidence for it.",
  ],
  revisedCv: `Alex Morgan
Product Designer · Melbourne

SUMMARY
Product designer focused on research-led onboarding experiences, with practical skills in prototyping, interaction design and accessibility.

EXPERIENCE
Product Designer — Example Studio
2022–2026
• Used usability findings to guide an onboarding redesign, working with product and engineering.
• Built Figma prototypes and facilitated customer usability sessions.
• Documented interaction decisions and reviewed designs for accessibility.

SKILLS
Figma, user research, prototyping, interaction design, accessibility.`,
  coverLetter: "",
  matchedSkills: [],
  missingSkills: [],
};

function descriptionFor(job: Job) {
  return `${job.description}\n\nResponsibilities\n${job.responsibilities.map((item) => `• ${item}`).join("\n")}\n\nRequirements\n${job.requirements.map((item) => `• ${item}`).join("\n")}`;
}

type StudioProps = {
  jobs: Job[];
  initialJobId?: string;
  isDemoInventory: boolean;
  initialTailor?: boolean;
  initialNotice?: string;
};

export function ApplicationStudio(props: StudioProps) {
  const session = useSession();
  // Reset the whole private editor and its results when account identity changes.
  // A subsequent user never inherits the previous person's in-memory CV.
  return <StudioEditor key={session.user?.id ?? "signedout"} {...props} />;
}

function StudioEditor({
  jobs,
  initialJobId,
  isDemoInventory,
  initialTailor = false,
  initialNotice,
}: StudioProps) {
  const session = useSession();
  const initialJob = jobs.find((job) => job.id === initialJobId);
  const [mode, setMode] = useState<"improve" | "tailor">(
    initialJob || initialTailor ? "tailor" : "improve",
  );
  const [cv, setCv] = useState("");
  const [goals, setGoals] = useState("");
  const [jobId, setJobId] = useState(initialJob?.id ?? "");
  const [jobTitle, setJobTitle] = useState(initialJob?.title ?? "");
  const [jobDescription, setJobDescription] = useState(
    initialJob ? descriptionFor(initialJob) : "",
  );
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<StudioResult | null>(null);
  const [isExample, setIsExample] = useState(false);
  const [reviewedCv, setReviewedCv] = useState("");
  const [reviewedLetter, setReviewedLetter] = useState("");
  const [copied, setCopied] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const studioRequest = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      studioRequest.current?.abort();
    };
  }, []);

  function showResult(output: StudioResult, example = false) {
    setResult(output);
    setIsExample(example);
    setReviewedCv(output.revisedCv);
    setReviewedLetter(output.coverLetter);
    setCopied(false);
  }
  function selectJob(id: string) {
    setJobId(id);
    const job = jobs.find((item) => item.id === id);
    if (job) {
      setJobTitle(job.title);
      setJobDescription(descriptionFor(job));
    } else {
      setJobTitle("");
      setJobDescription("");
    }
  }
  async function readFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage("");
    if (!file.name.toLowerCase().endsWith(".txt")) {
      setMessage(
        "Please choose a plain-text .txt file, or paste the text from your CV.",
      );
      event.target.value = "";
      return;
    }
    if (file.size > 60000) {
      setMessage("Please choose a text file smaller than 60 KB.");
      event.target.value = "";
      return;
    }
    try {
      const text = await file.text();
      if (text.length > 24000) {
        setMessage(
          "Keep your CV under 24,000 characters. You can paste the sections you want help with.",
        );
      } else {
        setCv(text);
        setConsent(false);
        setMessage(
          "Your text file is in the editor. It has not been sent to OpenAI.",
        );
      }
    } catch {
      setMessage(
        "We couldn’t read that file. You can paste your CV text instead.",
      );
    }
    event.target.value = "";
  }
  async function generate(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    if (studioRequest.current) return;
    if (!session.configured) {
      setMessage(
        "The connected CV studio is being prepared. You can still explore the clearly labelled static example. Your CV has not been sent anywhere.",
      );
      return;
    }
    if (!session.user) {
      session.openAuth();
      return;
    }
    if (!session.isPremium) {
      setMessage(
        "An active Careers+ subscription is needed for personal CV guidance. You can explore the static example or view Careers+.",
      );
      return;
    }
    if (cv.trim().length < 100) {
      setMessage(
        "Add at least 100 characters of CV text so the studio has enough context.",
      );
      return;
    }
    if (mode === "tailor" && jobDescription.trim().length < 50) {
      setMessage(
        "Choose a role or add at least 50 characters of the job description.",
      );
      return;
    }
    if (!consent) {
      setMessage(
        "Please confirm that you agree to sending this text to OpenAI for your review.",
      );
      return;
    }
    const controller = new AbortController();
    studioRequest.current = controller;
    setBusy(true);
    try {
      const response = await fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          mode,
          cv,
          goals,
          consent,
          ...(mode === "tailor" ? { jobTitle, jobDescription } : {}),
        }),
      });
      const data = await response.json();
      if (!mounted.current || controller.signal.aborted) return;
      if (!response.ok)
        throw new Error(
          data.error ||
            "The studio could not complete your review. Please try again.",
        );
      if (!data.result || typeof data.result.revisedCv !== "string")
        throw new Error(
          "The studio returned an incomplete review. Please try again.",
        );
      showResult(data.result);
      setMessage(
        "Your review is ready. Check every fact and keep the changes that feel right.",
      );
      resultRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    } catch (error) {
      if (mounted.current && !controller.signal.aborted)
        setMessage(
          error instanceof Error
            ? error.message
            : "The studio is temporarily unavailable. Your draft remains in the editor.",
        );
    } finally {
      if (mounted.current && !controller.signal.aborted) {
        studioRequest.current = null;
        setBusy(false);
      }
    }
  }
  function resultText() {
    return `${isExample ? "STATIC EXAMPLE — FICTIONAL CV\n\n" : ""}${reviewedCv}${reviewedLetter ? `\n\nCOVER LETTER\n\n${reviewedLetter}` : ""}`;
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(resultText());
      setCopied(true);
    } catch {
      setMessage(
        "Your browser couldn’t copy automatically. Select and copy the reviewed text in the editor.",
      );
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([resultText()], { type: "text/plain;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = isExample
      ? "westmere-static-example.txt"
      : "westmere-reviewed-cv.txt";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <main id="main">
      <section className="page-intro container">
        <div className="plus-wordmark" style={{ marginBottom: 18 }}>
          <Sparkles size={18} />
          Careers<span>+</span>
        </div>
        <h1>Your experience, in focus.</h1>
        <p className="muted">
          Make a clearer CV, prepare for a specific role, or find a better way
          to describe the work you’ve already done.
        </p>
      </section>
      <div className="container page-content">
        {initialNotice && (
          <div className="notice" role="status">
            {initialNotice}
          </div>
        )}
        {!session.isPremium && (
          <div
            className="notice"
            style={{ display: "flex", gap: 12, alignItems: "start" }}
          >
            <Sparkles
              size={20}
              style={{ flexShrink: 0, color: "var(--purple)" }}
            />
            <p>
              Explore the editor and static example freely. Personal OpenAI
              guidance is included with Careers+ at A$25/month.{" "}
              <Link className="text-button" href="/careers-plus">
                Explore Careers+
              </Link>
            </p>
          </div>
        )}
        <div className="studio-layout">
          <section className="panel" aria-labelledby="studio-editor-heading">
            <h2 id="studio-editor-heading">
              A little context goes a long way.
            </h2>
            <p className="fineprint">
              Paste your CV or bring a plain-text file. This editor keeps its
              contents in this page’s memory; refresh or leave to clear it.
            </p>
            <form onSubmit={generate} style={{ marginTop: 22 }}>
              <label className="field-label" htmlFor="studio-mode">
                What would you like help with?
              </label>
              <select
                id="studio-mode"
                value={mode}
                onChange={(event) => {
                  setMode(event.target.value as "improve" | "tailor");
                  setConsent(false);
                }}
              >
                <option value="improve">Improve my CV generally</option>
                <option value="tailor">Tailor my CV to a role</option>
              </select>
              <div className="actions-row">
                <label
                  className="field-label"
                  htmlFor="studio-cv"
                  style={{ margin: 0 }}
                >
                  Your CV text
                </label>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => uploadRef.current?.click()}
                >
                  <Upload
                    size={13}
                    style={{ marginRight: 5, verticalAlign: "middle" }}
                  />
                  Import .txt
                </button>
              </div>
              <input
                ref={uploadRef}
                type="file"
                accept=".txt,text/plain"
                onChange={(event) => void readFile(event)}
                aria-label="Import a plain-text CV"
                hidden
              />
              <textarea
                id="studio-cv"
                value={cv}
                onChange={(event) => {
                  setCv(event.target.value);
                  setConsent(false);
                }}
                placeholder="Start with your experience, skills and achievements. Include only information you want the studio to review."
                maxLength={24000}
                autoComplete="off"
                spellCheck
              />
              <div className="actions-row" style={{ marginTop: -7 }}>
                <span className="fineprint">
                  {cv.length.toLocaleString("en-AU")} / 24,000 characters
                </span>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setCv(sampleCv);
                    setConsent(false);
                    setMessage(
                      "Fictional example CV loaded. No personal details were used.",
                    );
                  }}
                >
                  Use an example CV
                </button>
              </div>
              <label
                className="field-label"
                htmlFor="studio-goals"
                style={{ marginTop: 22 }}
              >
                Anything you’d like to focus on?{" "}
                <span className="muted">(optional)</span>
              </label>
              <textarea
                id="studio-goals"
                value={goals}
                onChange={(event) => {
                  setGoals(event.target.value);
                  setConsent(false);
                }}
                placeholder="For example: make my summary clearer, or highlight my experience working with customers."
                maxLength={2000}
                style={{ minHeight: 95, height: 95 }}
              />
              {mode === "tailor" && (
                <>
                  <label className="field-label" htmlFor="studio-role">
                    Choose a role, or add your own
                  </label>
                  <select
                    id="studio-role"
                    value={jobId}
                    onChange={(event) => {
                      selectJob(event.target.value);
                      setConsent(false);
                    }}
                  >
                    <option value="">Paste a job description below</option>
                    {jobs.map((job) => (
                      <option value={job.id} key={job.id}>
                        {job.title} · {job.company}
                        {isDemoInventory ? " (example)" : ""}
                      </option>
                    ))}
                  </select>
                  <label className="field-label" htmlFor="studio-job-title">
                    Job title <span className="muted">(optional)</span>
                  </label>
                  <input
                    id="studio-job-title"
                    value={jobTitle}
                    maxLength={200}
                    onChange={(event) => {
                      setJobTitle(event.target.value);
                      setConsent(false);
                    }}
                    placeholder="The role you’re applying for"
                    style={{ width: "100%", marginBottom: 18 }}
                  />
                  <label className="field-label" htmlFor="studio-description">
                    Job description
                  </label>
                  <textarea
                    id="studio-description"
                    value={jobDescription}
                    onChange={(event) => {
                      setJobDescription(event.target.value);
                      setConsent(false);
                    }}
                    placeholder="Include the role’s responsibilities and requirements."
                    maxLength={16000}
                    style={{ minHeight: 180 }}
                  />
                  {isDemoInventory && jobId && (
                    <p className="fineprint" style={{ marginBottom: 18 }}>
                      This selected role is fictional sample content from the
                      development preview.
                    </p>
                  )}
                </>
              )}
              <label className="fineprint" style={{ marginTop: 10 }}>
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                />
                <span>
                  I agree to send the text above to OpenAI for this review. I’ll
                  remove sensitive details I don’t need to share and check the
                  suggestions before using them.
                </span>
              </label>
              <button
                className="button purple full"
                type="submit"
                disabled={busy}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Sparkles size={17} />
                )}{" "}
                {busy
                  ? "Bringing your experience into focus…"
                  : session.isPremium
                    ? mode === "tailor"
                      ? "Prepare my application"
                      : "Review my CV"
                    : "Explore personal CV guidance"}
                {!busy && <ArrowRight size={16} />}
              </button>
              <p className="fineprint" style={{ marginTop: 14 }}>
                One completed request uses one of your 30 monthly studio
                requests. Search skill-match filters run separately and don’t
                use this allowance.
              </p>
              {message && (
                <p className="message" role="status">
                  {message}
                </p>
              )}
            </form>
          </section>
          <section
            ref={resultRef}
            className="panel"
            aria-labelledby="studio-result-heading"
            style={{ scrollMarginTop: 100 }}
          >
            <div className="result-heading">
              <h2 id="studio-result-heading">Room for your next chapter.</h2>
              <Leaf size={20} color="var(--primary)" />
            </div>
            {!result ? (
              <div className="studio-empty">
                <div
                  className="round-icon"
                  style={{ background: "var(--lilac)", color: "var(--purple)" }}
                >
                  <FileText size={27} />
                </div>
                <h3 style={{ fontSize: 22 }}>Your work has a story.</h3>
                <p className="muted">
                  Start with what you’ve done. The studio helps you express it
                  clearly, while keeping your voice and the facts intact.
                </p>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => {
                    showResult(sampleResult, true);
                    setMessage(
                      "Showing a static demonstration with a fictional CV. It is not a review of your editor contents.",
                    );
                  }}
                >
                  See a static example
                  <ArrowRight size={16} />
                </button>
                <p className="fineprint">
                  Fictional sample. No account, payment or AI request.
                </p>
              </div>
            ) : (
              <>
                <div className="notice" style={{ marginTop: 22 }} role="status">
                  {isExample ? (
                    <>
                      <strong>Static example · fictional CV.</strong> This
                      demonstrates the format using Alex Morgan’s example CV.
                    </>
                  ) : (
                    <>
                      <strong>Your review is ready.</strong> Check every claim,
                      date and qualification before you use it.
                    </>
                  )}
                </div>
                <p className="result-copy">{result.summary}</p>
                <div className="result-section">
                  <h3>Small changes, clearer strengths.</h3>
                  <ul>
                    {result.improvements.map((improvement, index) => (
                      <li key={index}>{improvement}</li>
                    ))}
                  </ul>
                </div>
                {result.revisedCv && (
                  <div className="result-section">
                    <label className="field-label" htmlFor="studio-reviewed-cv">
                      Review and edit your CV
                    </label>
                    <textarea
                      id="studio-reviewed-cv"
                      className="result-copy"
                      value={reviewedCv}
                      onChange={(event) => {
                        setReviewedCv(event.target.value);
                        setCopied(false);
                      }}
                      style={{ minHeight: 390 }}
                      spellCheck
                    />
                  </div>
                )}
                {result.coverLetter && (
                  <div className="result-section">
                    <label
                      className="field-label"
                      htmlFor="studio-reviewed-letter"
                    >
                      Review and edit your cover letter
                    </label>
                    <textarea
                      id="studio-reviewed-letter"
                      className="result-copy"
                      value={reviewedLetter}
                      onChange={(event) => {
                        setReviewedLetter(event.target.value);
                        setCopied(false);
                      }}
                      style={{ minHeight: 240 }}
                      spellCheck
                    />
                  </div>
                )}
                {result.matchedSkills.length > 0 && (
                  <div className="result-section">
                    <h3>Evidence that connects with the role</h3>
                    <ul>
                      {result.matchedSkills.map((skill) => (
                        <li key={skill}>{skill}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {result.missingSkills.length > 0 && (
                  <div className="result-section">
                    <h3>Requirements not yet evidenced</h3>
                    <p className="fineprint">
                      These weren’t clear in the supplied CV. Add them only if
                      they accurately reflect your experience.
                    </p>
                    <ul>
                      {result.missingSkills.map((skill) => (
                        <li key={skill}>{skill}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="inline-actions">
                  <button
                    type="button"
                    className="button secondary small"
                    onClick={() => void copy()}
                  >
                    {copied ? <CheckCheck size={15} /> : <Copy size={15} />}{" "}
                    {copied ? "Copied" : "Copy reviewed text"}
                  </button>
                  <button
                    type="button"
                    className="button secondary small"
                    onClick={download}
                  >
                    <Download size={15} />
                    Download .txt
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Clear review output"
                    onClick={() => {
                      setResult(null);
                      setReviewedCv("");
                      setReviewedLetter("");
                      setIsExample(false);
                    }}
                  >
                    <X size={16} />
                  </button>
                </div>
                <p className="fineprint" style={{ marginTop: 18 }}>
                  Keep your voice. Add a number or achievement only when you can
                  substantiate it. These suggestions do not guarantee an
                  interview or an employer’s screening result.
                </p>
              </>
            )}
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "start",
                paddingTop: 20,
                marginTop: 25,
                borderTop: "1px solid var(--line)",
              }}
            >
              <LockKeyhole
                size={15}
                style={{ flexShrink: 0, color: "var(--muted)" }}
              />
              <p className="fineprint">
                Your CV isn’t used to make your profile publicly searchable.
                Applying to an employer is always a separate choice.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
