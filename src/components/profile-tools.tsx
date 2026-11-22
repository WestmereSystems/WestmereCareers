"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FileUp, Download, Trash2, Check } from "lucide-react";
import { useSession } from "./providers";
type CV = {
  id: string;
  filename: string;
  media_type: string;
  bytes: number;
  created_at: string;
};
export function SavedCVButton({
  onLoad,
  maxLength = 40000,
}: {
  onLoad: (text: string) => void;
  maxLength?: number;
}) {
  const session = useSession();
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  if (!session.user) return null;
  return (
    <div className="saved-cv-control">
      <button
        className="button secondary small"
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await fetch("/api/profile", { cache: "no-store" }),
              d = await r.json();
            if (!r.ok) throw new Error(d.error);
            const text = d.profile?.cv_text || "";
            if (!text)
              throw new Error(
                "Upload and select a base CV on your profile first.",
              );
            if (text.length > maxLength)
              throw new Error(
                `This tool supports ${maxLength.toLocaleString()} characters. Copy and shorten your base CV before using it.`,
              );
            onLoad(text);
            setMessage(
              "Your base CV is loaded. Review it before sharing or requesting assistance.",
            );
          } catch (e) {
            setMessage(
              e instanceof Error
                ? e.message
                : "Your base CV could not be loaded.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        Use my saved base CV
      </button>
      {message && (
        <p className="fineprint" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
export function CVHistory({ onSelect }: { onSelect: (text: string) => void }) {
  const [cvs, setCVs] = useState<CV[]>([]),
    [active, setActive] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [page, setPage] = useState(1),
    [dragging, setDragging] = useState(false),
    [loaded, setLoaded] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const session = useSession();
  async function load() {
    const r = await fetch("/api/profile/cvs", { cache: "no-store" });
    const d = await r.json();
    if (!r.ok) throw Error(d.error);
    setCVs(d.cvs || []);
    setActive(d.activeId || null);
    setLoaded(true);
  }
  useEffect(() => {
    if (session.user)
      void load().catch(() =>
        setMessage(
          "Your CV history could not be loaded. Refresh to try again.",
        ),
      );
  }, [session.user?.id]);
  useEffect(
    () => setPage((p) => Math.min(p, Math.max(1, Math.ceil(cvs.length / 5)))),
    [cvs.length],
  );
  async function upload(files: File[]) {
    if (busy) return;
    if (!loaded) {
      setMessage("Please wait for your library to load.");
      return;
    }
    if (cvs.length + files.length > 20) {
      setMessage(
        "Your library holds up to 20 CVs. Delete at least one resume before uploading another, or choose fewer files.",
      );
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      for (const file of files) {
        const f = new FormData();
        f.set("file", file);
        const r = await fetch("/api/profile/cvs", { method: "POST", body: f });
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (d.selectedAsBase) onSelect(d.text);
      }
      const firstUpload = cvs.length === 0;
      await load();
      setPage(1);
      setMessage(
        firstUpload
          ? "Your first CV was selected as your base CV. Further uploads stay in your library until you select them."
          : `${files.length} CV${files.length === 1 ? "" : "s"} uploaded privately. Select a version to make it your account CV.`,
      );
    } catch (e) {
      await load().catch(() => {});
      setMessage(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  async function choose(id: string) {
    setBusy(true);
    try {
      const r = await fetch("/api/profile/cvs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      onSelect(d.text);
      setActive(id);
      setMessage(d.message);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "CV could not be selected.");
    } finally {
      setBusy(false);
    }
  }
  if (!loaded)
    return (
      <section className="panel cv-library">
        <h2>My CV</h2>
        <p role="status">{message || "Loading your private CV library…"}</p>
      </section>
    );
  const selected = cvs.find((c) => c.id === active);
  const total = Math.max(1, Math.ceil(cvs.length / 5));
  return (
    <section className="panel cv-library">
      <div className="section-heading">
        <h2>My CV</h2>
        <span className="badge">{cvs.length} of 20 versions</span>
      </div>
      <div className="selected-cv">
        <Check size={21} />
        <div>
          <strong>
            {selected ? selected.filename : "No account CV selected"}
          </strong>
          <p className="fineprint">
            {selected
              ? `Selected account CV · ${new Date(selected.created_at).toLocaleString("en-AU")}`
              : "Choose an uploaded version below. Existing applications keep their original documents."}
          </p>
        </div>
      </div>
      <div
        className={`cv-dropzone ${dragging ? "dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload(Array.from(e.dataTransfer.files));
        }}
      >
        <FileUp size={32} />
        <strong>Drop your CV files here</strong>
        <p>PDF or Word (.docx) · up to 4 MB per file</p>
        <button
          type="button"
          className="button secondary"
          disabled={busy || !loaded}
          onClick={() => {
            if (cvs.length >= 20) {
              setMessage(
                "Your library holds 20 CVs. Delete at least one resume before uploading another.",
              );
              return;
            }
            input.current?.click();
          }}
        >
          {busy ? "Uploading…" : "Choose CV files"}
        </button>
        <input
          ref={input}
          type="file"
          multiple
          className="visually-hidden"
          aria-label="Upload CV files"
          accept=".pdf,.docx"
          disabled={busy || !loaded}
          onChange={(e) => void upload(Array.from(e.target.files || []))}
        />
      </div>
      <p className="fineprint">
        Up to 20 versions in your library. Uploading does not send files to
        OpenAI or submit an application.
      </p>
      <h3>CV history</h3>
      {cvs.length ? (
        <ul className="cv-history">
          {cvs.slice((page - 1) * 5, page * 5).map((cv) => (
            <li key={cv.id} className={cv.id === active ? "active-cv" : ""}>
              <div>
                <strong>{cv.filename}</strong>
                <p className="fineprint">
                  {new Date(cv.created_at).toLocaleString("en-AU")} ·{" "}
                  {Math.ceil(cv.bytes / 1024)} KB
                </p>
              </div>
              <div className="inline-actions">
                <button
                  className="button secondary small"
                  disabled={busy || active === cv.id}
                  onClick={() => void choose(cv.id)}
                >
                  {active === cv.id ? (
                    <>
                      <Check size={15} />
                      Selected
                    </>
                  ) : (
                    "Use this CV"
                  )}
                </button>
                <a
                  className="icon-button"
                  href={`/api/profile/cvs?id=${cv.id}`}
                  aria-label={`Download ${cv.filename}`}
                >
                  <Download size={18} />
                </a>
                <button
                  className="icon-button"
                  disabled={busy}
                  aria-label={`Delete ${cv.filename}`}
                  onClick={async () => {
                    if (
                      !window.confirm(
                        `Delete ${cv.filename} from your private CV library? Submitted application copies remain.`,
                      )
                    )
                      return;
                    setBusy(true);
                    try {
                      const r = await fetch("/api/profile/cvs", {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: cv.id }),
                      });
                      const d = await r.json();
                      if (!r.ok) throw Error(d.error);
                      await load();
                      setMessage(d.message);
                    } catch (e) {
                      setMessage(
                        e instanceof Error ? e.message : "Delete failed.",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p>No CVs uploaded yet.</p>
      )}
      <nav className="numbered-pagination" aria-label="CV history pages">
        {Array.from({ length: total }, (_, i) => (
          <button
            key={i}
            className="page-number"
            aria-label={`CV page ${i + 1}`}
            aria-current={page === i + 1 ? "page" : undefined}
            onClick={() => setPage(i + 1)}
          >
            {i + 1}
          </button>
        ))}
      </nav>
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
      <Link className="text-link" href="/studio">
        Open Careers+ Studio →
      </Link>
    </section>
  );
}
export function ChangeEmail() {
  const session = useSession();
  const [email, setEmail] = useState(""),
    [sent, setSent] = useState(false),
    [code, setCode] = useState(""),
    [codeEmail, setCodeEmail] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <details className="account-email">
      <summary>Change account email</summary>
      <p className="fineprint">
        Both inboxes must confirm the change. Use the address that received each
        code. Your current address remains in place until confirmation is
        complete.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await fetch("/api/profile/email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
              }),
              d = await r.json();
            setMessage(d.message || d.error);
            if (r.ok) {
              setSent(true);
              setCodeEmail(email);
            }
          } catch {
            setMessage("We couldn’t request the change.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field-label">
          New email address
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <button className="button secondary small" disabled={busy}>
          Send confirmation codes
        </button>
      </form>
      {sent && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const r = await fetch("/api/profile/email", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email: codeEmail, code }),
                }),
                d = await r.json();
              setMessage(d.message || d.error);
              if (r.ok) {
                setCode("");
                await session.refresh();
              }
            } catch {
              setMessage("We couldn’t verify this code.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field-label">
            Address that received this code
            <input
              type="email"
              required
              value={codeEmail}
              onChange={(e) => setCodeEmail(e.target.value)}
            />
          </label>
          <label className="field-label">
            Confirmation code
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              pattern="[0-9]{6,8}"
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </label>
          <button className="button secondary small" disabled={busy}>
            Confirm this code
          </button>
        </form>
      )}
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
    </details>
  );
}
export { Notifications } from "./notifications";
