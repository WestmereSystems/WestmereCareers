"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  ArrowLeft,
  ArrowRight,
  FileUp,
  Trash2,
  LoaderCircle,
} from "lucide-react";
import { type Job } from "@/lib/jobs";
import {
  type CandidateProfile,
  attachmentKinds,
  workRightsOptions,
} from "@/lib/candidate-profile";
import { ApplicationCV } from "./application-cv";
import { ApplicationProfileSummary } from "./candidate-profile";
type Attachment = {
  id: string;
  filename: string;
  kind: keyof typeof attachmentKinds;
  bytes: number;
};
export function ApplicationWizard({
  job,
  isDemo,
  onClose,
}: {
  job: Job;
  isDemo: boolean;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0),
    [profile, setProfile] = useState<CandidateProfile | null>(null),
    [profileConfirmed, setProfileConfirmed] = useState(false),
    [cv, setCV] = useState(""),
    [cvId, setCVId] = useState<string | null>(null),
    [cvConfirmed, setCVConfirmed] = useState(false),
    [cvBusy, setCVBusy] = useState(false),
    [letter, setLetter] = useState(""),
    [attachments, setAttachments] = useState<Attachment[]>([]),
    [kind, setKind] = useState<keyof typeof attachmentKinds>("cover_letter"),
    [rights, setRights] =
      useState<keyof typeof workRightsOptions>("not_provided"),
    [licence, setLicence] = useState("not_provided"),
    [certifications, setCertifications] = useState(""),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [testConfirmed, setTestConfirmed] = useState(false),
    [done, setDone] = useState(false),
    [profileRevision, setProfileRevision] = useState(0);
  const [cvFilename, setCVFilename] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const steps = [
    "Your profile",
    "Your CV",
    "Documents & declarations",
    "Review & submit",
  ];
  useEffect(() => {
    if (isDemo) {
      setProfile({
        first_name: "Alex",
        last_name: "Example",
        full_name: "Alex Example",
        email: "alex@example.test",
        social_links: {},
      });
      return;
    }
    const c = new AbortController();
    setProfile(null);
    fetch("/api/profile", { cache: "no-store", signal: c.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (!c.signal.aborted)
          setProfile({
            ...d.profile,
            email: d.user?.email,
            social_links: d.profile?.social_links || {},
          });
      })
      .catch((e) => {
        if (!c.signal.aborted) setMessage(e.message);
      });
    return () => c.abort();
  }, [isDemo, profileRevision]);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  async function upload(files: File[]) {
    if (!files.length || busy) return;
    if (attachments.length + files.length > 8) {
      setMessage("Choose up to eight optional documents.");
      return;
    }
    if (
      kind === "cover_letter" &&
      (files.length > 1 || attachments.some((a) => a.kind === "cover_letter"))
    ) {
      setMessage(
        "Choose one cover letter. Remove the previous one to replace it.",
      );
      return;
    }
    setBusy(true);
    setConsent(false);
    try {
      for (const file of files) {
        if (isDemo) {
          setAttachments((a) => [
            ...a,
            {
              id: crypto.randomUUID(),
              filename: file.name,
              kind,
              bytes: file.size,
            },
          ]);
          continue;
        }
        const f = new FormData();
        f.set("file", file);
        f.set("kind", kind);
        const r = await fetch("/api/applications/uploads", {
          method: "POST",
          body: f,
        });
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        setAttachments((a) => [...a, d]);
        if (kind === "cover_letter") setLetter(d.text || "");
      }
      setMessage("Documents prepared. Review them before submitting.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(a: Attachment) {
    setBusy(true);
    try {
      if (!isDemo) {
        const r = await fetch("/api/applications/uploads", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: a.id }),
        });
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
      }
      setAttachments((v) => v.filter((x) => x.id !== a.id));
      if (a.kind === "cover_letter") setLetter("");
      setConsent(false);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Attachment could not be removed.",
      );
    } finally {
      setBusy(false);
    }
  }
  function advance() {
    setMessage("");
    if (step === 0 && (!profile?.full_name?.trim() || !profileConfirmed)) {
      setMessage(
        "Review and confirm your profile details first. Add your name on your profile if it is missing.",
      );
      return;
    }
    if (step === 1 && (cv.trim().length < 50 || !cvConfirmed)) {
      setMessage(
        "Choose or upload a CV, then confirm it for this application.",
      );
      return;
    }
    setStep((s) => s + 1);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (step !== 3 || !consent || busy || cvBusy) return;
    setBusy(true);
    setMessage("");
    try {
      if (isDemo) {
        setDone(true);
        return;
      }
      const r = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job.id,
          testApplication: testConfirmed,
          cvId,
          cvText: cv,
          coverLetter: letter,
          uploadIds: attachments.map((a) => a.id),
          rightToWork: rights,
          driversLicence: licence,
          certifications,
          consent,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setDone(true);
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Your application was not submitted. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (done)
    return (
      <div className="application-form" role="status">
        <Check size={30} />
        <h3>
          {isDemo ? "Preview complete" : "Your application has been received."}
        </h3>
        <p>
          {isDemo
            ? "Nothing was submitted or saved."
            : "Your documents are saved with this application. Follow receipt, views and hiring updates in My applications."}
        </p>
        <Link className="button secondary" href="/account?tab=applications">
          My applications
        </Link>
        <button type="button" className="text-button" onClick={onClose}>
          Close
        </button>
      </div>
    );
  return (
    <form className="application-form application-wizard" onSubmit={submit}>
      <h3>
        {isDemo
          ? "Application preview"
          : "Your next step, one detail at a time."}
      </h3>
      {isDemo && (
        <p className="notice">
          Fictional preview. Files stay in this page and nothing is submitted.
        </p>
      )}
      <ol className="application-stepper" aria-label="Application progress">
        {steps.map((label, i) => (
          <li
            key={label}
            className={i < step ? "complete" : i === step ? "current" : ""}
          >
            <button
              type="button"
              aria-current={i === step ? "step" : undefined}
              disabled={i > step || busy || cvBusy}
              onClick={() => {
                setStep(i);
                setConsent(false);
              }}
            >
              <span>{i < step ? <Check size={15} /> : i + 1}</span>
              {label}
            </button>
          </li>
        ))}
      </ol>
      <h4 ref={heading} tabIndex={-1}>
        {steps[step]}
      </h4>
      {step === 0 && (
        <>
          {profile ? (
            <ApplicationProfileSummary profile={profile} />
          ) : (
            <p role="status">Loading your profile…</p>
          )}
          <div className="inline-actions">
            <Link href="/account" target="_blank" className="text-link">
              Edit your profile in a new tab
            </Link>
            <button
              type="button"
              className="button secondary small"
              onClick={() => {
                setProfileRevision((r) => r + 1);
                setProfileConfirmed(false);
              }}
            >
              Refresh profile details
            </button>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={profileConfirmed}
              onChange={(e) => setProfileConfirmed(e.target.checked)}
            />
            I have reviewed my profile details and understand they stay current
            for this employer.
          </label>
        </>
      )}
      {step === 1 && (
        <>
          {isDemo ? (
            <label className="field-label">
              Sample CV text
              <textarea
                minLength={50}
                maxLength={40000}
                value={cv}
                onChange={(e) => {
                  setCV(e.target.value);
                  setCVConfirmed(false);
                }}
              />
            </label>
          ) : (
            <ApplicationCV
              value={cv}
              cvId={cvId}
              onBusyChange={setCVBusy}
              onChange={(text, id, filename) => {
                setCV(text);
                setCVFilename(filename || "");
                setCVId(id);
                setCVConfirmed(false);
                setConsent(false);
              }}
            />
          )}
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={cvConfirmed}
              onChange={(e) => setCVConfirmed(e.target.checked)}
            />
            Use this CV for this application. Later library changes will not
            replace it.
          </label>
        </>
      )}
      {step === 2 && (
        <>
          <label className="field-label">
            Cover letter · optional
            <textarea
              maxLength={15000}
              value={letter}
              readOnly={attachments.some((a) => a.kind === "cover_letter")}
              onChange={(e) => {
                setLetter(e.target.value);
                setConsent(false);
              }}
            />
          </label>
          <p className="fineprint">
            Write a cover letter above or upload one below. Uploaded
            cover-letter text is kept with its original file.
          </p>
          <div className="application-attachment-uploader">
            <label className="field-label">
              Document purpose
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as typeof kind)}
              >
                {Object.entries(attachmentKinds).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              <FileUp size={21} />
              Add optional documents · PDF or Word
              <input
                type="file"
                multiple
                accept=".pdf,.docx"
                disabled={busy}
                onChange={(e) => {
                  void upload(Array.from(e.target.files || []));
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <p className="fineprint">
            Up to eight files, 4 MB each. Share only documents relevant to this
            role. Declarations do not require identity-document uploads. No
            automatic verification is performed.
          </p>
          <ul className="application-attachments">
            {attachments.map((a) => (
              <li key={a.id}>
                <span>
                  <strong>{a.filename}</strong> · {attachmentKinds[a.kind]}
                </span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove ${a.filename}`}
                  disabled={busy}
                  onClick={() => void remove(a)}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
          <label className="field-label">
            Right to work in Australia · optional declaration
            <select
              value={rights}
              onChange={(e) => {
                setRights(e.target.value as typeof rights);
                setConsent(false);
              }}
            >
              {Object.entries(workRightsOptions).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Do you hold a current driver’s licence? · optional
            <select
              value={licence}
              onChange={(e) => {
                setLicence(e.target.value);
                setConsent(false);
              }}
            >
              <option value="not_provided">
                Prefer to discuss with the employer
              </option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <label className="field-label">
            Relevant position certifications · optional
            <textarea
              maxLength={2000}
              value={certifications}
              onChange={(e) => {
                setCertifications(e.target.value);
                setConsent(false);
              }}
              placeholder="Name the certifications relevant to this position. Do not enter identity numbers."
            />
          </label>
        </>
      )}
      {step === 3 && (
        <>
          {job.isTest && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={testConfirmed}
                onChange={(e) => setTestConfirmed(e.target.checked)}
              />
              This is a fictional test role. I am using synthetic details and
              documents, with no expectation of employment.
            </label>
          )}
          {profile && <ApplicationProfileSummary profile={profile} />}
          <div className="application-final-review">
            <h4>Application for {job.title}</h4>
            <p>
              {job.company} · {job.location}
            </p>
            <h4>Confirmed CV</h4>
            <p>
              {cvFilename ||
                (cvId
                  ? "Selected original file and its extracted text"
                  : "Reviewed CV text")}
            </p>
            <details>
              <summary>Review CV text</summary>
              <pre>{cv}</pre>
            </details>
            <h4>Cover letter</h4>
            <p className="preserve-lines">
              {letter || "No cover-letter text supplied."}
            </p>
            <h4>Optional documents</h4>
            {attachments.length ? (
              <ul>
                {attachments.map((a) => (
                  <li key={a.id}>
                    {a.filename} · {attachmentKinds[a.kind]}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No optional documents.</p>
            )}
            <dl>
              <dt>Right to work</dt>
              <dd>{workRightsOptions[rights]}</dd>
              <dt>Driver’s licence</dt>
              <dd>
                {licence === "not_provided"
                  ? "Not declared"
                  : licence === "yes"
                    ? "Yes"
                    : "No"}
              </dd>
              <dt>Certifications</dt>
              <dd>{certifications || "Not declared"}</dd>
            </dl>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            I have checked this application and agree to share my current
            profile, confirmed CV, cover letter, selected documents and
            declarations with {job.company}.{" "}
            {isDemo ? "This is a preview only." : ""}
          </label>
        </>
      )}
      {busy && step === 2 && <p role="status">Preparing your documents…</p>}
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
      <div className="inline-actions">
        <button
          type="button"
          className="button secondary"
          disabled={busy || cvBusy}
          onClick={() => {
            if (step > 0) {
              setStep((s) => s - 1);
              setConsent(false);
            } else onClose();
          }}
        >
          <ArrowLeft size={16} />
          {step ? "Back" : "Close"}
        </button>
        {step < 3 ? (
          <button
            type="button"
            className="button primary"
            disabled={busy || cvBusy || !profile}
            onClick={advance}
          >
            Continue
            <ArrowRight size={16} />
          </button>
        ) : (
          <button
            className="button primary"
            type="submit"
            disabled={
              busy || cvBusy || !consent || (job.isTest && !testConfirmed)
            }
          >
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Check size={16} />
            )}
            Submit application
          </button>
        )}
      </div>
      <p className="fineprint">
        Documents are uploaded privately when selected. Unsubmitted attachments
        expire after 24 hours. Selecting Continue does not submit your
        application.
      </p>
    </form>
  );
}
