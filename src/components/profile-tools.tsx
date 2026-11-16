"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
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
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [active, setActive] = useState<string | null>(null);
  const session = useSession();
  async function load() {
    const r = await fetch("/api/profile/cvs", { cache: "no-store" }),
      d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setCVs(d.cvs || []);
    setActive(d.activeId || null);
  }
  useEffect(() => {
    if (session.user)
      void load().catch(() =>
        setMessage(
          "Your CV history could not be loaded. Try refreshing this page.",
        ),
      );
  }, [session.user?.id]);
  async function choose(id: string) {
    setBusy(true);
    try {
      const r = await fetch("/api/profile/cvs", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        }),
        d = await r.json();
      if (!r.ok) throw new Error(d.error);
      onSelect(d.text);
      setActive(id);
      setMessage(d.message);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Your CV could not be selected.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel cv-library">
      <span className="badge">
        <FileUp size={16} />
        Your private CV library
      </span>
      <h2>A CV for each next step.</h2>
      <p>
        Upload a PDF or Word (.docx) file, review its extracted text and choose
        your base CV. Careers+ can use that text for improvements, tailoring and
        skill matching when you request it.
      </p>
      <label className="field-label" htmlFor="cv-upload">
        Upload a CV · up to 4 MB
      </label>
      <input
        id="cv-upload"
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        disabled={busy}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          setMessage("");
          try {
            const form = new FormData();
            form.set("file", file);
            const r = await fetch("/api/profile/cvs", {
                method: "POST",
                body: form,
              }),
              d = await r.json();
            if (!r.ok) throw new Error(d.error);
            onSelect(d.text);
            setMessage(d.message);
            await load();
          } catch (e) {
            setMessage(
              e instanceof Error ? e.message : "Your CV could not be uploaded.",
            );
          } finally {
            e.target.value = "";
            setBusy(false);
          }
        }}
      />
      <p className="fineprint">
        Up to 20 versions. Text-based PDFs only; save older .doc files as .docx.
        Uploading never sends your CV to OpenAI. Select a version to make it
        your base CV; this does not alter submitted applications.
      </p>
      <h3>Upload history</h3>
      {cvs.length ? (
        <ul className="cv-history">
          {cvs.map((cv) => (
            <li key={cv.id}>
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
                  disabled={busy}
                  onClick={() => void choose(cv.id)}
                >
                  {active === cv.id ? <Check size={15} /> : null}Use this CV
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
                        `Delete ${cv.filename} from your private upload history? Submitted application copies are separate.`,
                      )
                    )
                      return;
                    setBusy(true);
                    try {
                      const r = await fetch("/api/profile/cvs", {
                          method: "DELETE",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ id: cv.id }),
                        }),
                        d = await r.json();
                      if (!r.ok) throw new Error(d.error);
                      setMessage(d.message);
                      await load();
                    } catch (e) {
                      setMessage(
                        e instanceof Error
                          ? e.message
                          : "This CV could not be deleted.",
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
        <p>
          No files uploaded yet. Your pasted base CV remains available below.
        </p>
      )}
      {message && (
        <p role="status" className="message">
          {message}
        </p>
      )}
      <Link href="/studio" className="text-link">
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
