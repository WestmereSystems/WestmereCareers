"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "./providers";
import { RichText } from "./rich-text";
type SampleJob = {
  id: string;
  title: string;
  description: string;
  status: string;
  sample_applications: { id: string; candidate_name: string; status: string }[];
};
export function SampleWorkspace() {
  const session = useSession();
  const [jobs, setJobs] = useState<SampleJob[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [title, setTitle] = useState(""),
    [description, setDescription] = useState("");
  async function load() {
    const r = await fetch("/api/employers/sample", { cache: "no-store" }),
      d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setJobs(d.jobs || []);
  }
  useEffect(() => {
    if (session.user && session.sampleWorkspace)
      void load().catch((e) => setMessage(e.message));
  }, [session.user?.id, session.sampleWorkspace]);
  async function act(body: unknown) {
    setBusy(true);
    try {
      const r = await fetch("/api/employers/sample", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setMessage(d.message);
      await load();
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "The sample workspace could not be updated.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (session.loading) return <p>Loading your workspace…</p>;
  if (!session.user)
    return (
      <div className="panel">
        <p>Sign in with your invited account to open this sample.</p>
        <button className="button primary" onClick={session.openAuth}>
          Sign in
        </button>
      </div>
    );
  if (!session.sampleWorkspace)
    return (
      <p className="notice">
        This workspace is available to the invited account after email
        verification.{" "}
        <Link href="/employers/dashboard">Open your own hiring workspace</Link>.
      </p>
    );
  return (
    <>
      <p className="notice">
        <strong>Private sample workspace.</strong> Every role and applicant here
        is synthetic. Nothing is published to the job board and no applicant
        emails are sent. Real vacancies and application notifications are
        managed in your{" "}
        <Link href="/employers/dashboard">verified hiring workspace</Link>.
      </p>
      <div className="account-grid">
        <form
          className="panel"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const r = await fetch("/api/employers/sample", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ title, description }),
                }),
                d = await r.json();
              if (!r.ok) throw new Error(d.error);
              setTitle("");
              setDescription("");
              setMessage(d.message);
              await load();
            } catch (e) {
              setMessage(
                e instanceof Error
                  ? e.message
                  : "Could not create the sample role.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>Create a sample role</h2>
          <label className="field-label">
            Role title
            <input
              required
              minLength={3}
              maxLength={180}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="field-label">
            Description
            <textarea
              required
              minLength={20}
              maxLength={20000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the role. Use - for bullets and **bold** for emphasis."
            />
          </label>
          <button className="button primary" disabled={busy}>
            Save sample draft
          </button>
        </form>
        <section className="panel">
          <h2>Try the hiring journey</h2>
          <ol>
            <li>Create a draft and open it.</li>
            <li>Add a synthetic application.</li>
            <li>
              Record a first view and move it through shortlisting, interview or
              a decision.
            </li>
            <li>Close the vacancy when hiring finishes.</li>
          </ol>
          <p>
            In the live workspace these actions create candidate site
            notifications and, when enabled, email updates. Opening a list does
            not count as reviewing an individual application.
          </p>
        </section>
      </div>
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
      <div className="sample-role-list">
        {jobs.map((job) => (
          <article className="panel" key={job.id}>
            <span className="badge">Sample · {job.status}</span>
            <h2>{job.title}</h2>
            <RichText text={job.description} />
            <div className="actions-row">
              {["draft", "open", "closed"].map((status) => (
                <button
                  className="button secondary small"
                  key={status}
                  disabled={busy || job.status === status}
                  onClick={() =>
                    void act({ action: "status", id: job.id, status })
                  }
                >
                  {status === "open"
                    ? "Open role"
                    : status === "closed"
                      ? "Close role"
                      : "Move to draft"}
                </button>
              ))}
              <button
                className="button primary small"
                disabled={busy || job.status !== "open"}
                onClick={() => void act({ action: "simulate", id: job.id })}
              >
                Add synthetic application
              </button>
            </div>
            <h3>Application progress · {job.sample_applications.length}</h3>
            {job.sample_applications.map((app) => (
              <div className="application-row" key={app.id}>
                <div>
                  <p>{app.candidate_name}</p>
                  <details>
                    <summary>Preview candidate notification</summary>
                    <p className="fineprint">
                      Sample application · {app.status.replaceAll("_", " ")}. A
                      real applicant would see the update in their account and,
                      if enabled, receive a branded email.
                    </p>
                    <div className="inline-actions">
                      <button
                        className="button secondary small"
                        disabled={busy}
                        onClick={() =>
                          void act({
                            action: "notify",
                            id: app.id,
                            email: false,
                          })
                        }
                      >
                        Add preview to my site notifications
                      </button>
                      <button
                        className="button secondary small"
                        disabled={busy}
                        onClick={() =>
                          void act({
                            action: "notify",
                            id: app.id,
                            email: true,
                          })
                        }
                      >
                        Send one preview email to me
                      </button>
                    </div>
                    <p className="fineprint">
                      Uses your own verified email only. Up to three sample
                      emails per day. No real applicant is contacted.
                    </p>
                  </details>
                </div>
                <label>
                  Stage
                  <select
                    disabled={busy}
                    value={app.status}
                    onChange={(e) =>
                      void act({
                        action: "stage",
                        id: app.id,
                        status: e.target.value,
                      })
                    }
                  >
                    {[
                      "received",
                      "opened",
                      "shortlisted",
                      "interview",
                      "offer",
                      "not_proceeding",
                    ].map((x) => (
                      <option key={x} value={x}>
                        {x.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
          </article>
        ))}
      </div>
    </>
  );
}
