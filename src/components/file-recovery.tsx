"use client";
import { useCallback, useEffect, useState } from "react";
type Snapshot = { name: string; createdAt: string };
type FileEntry = {
  id: string;
  bucket: string;
  path: string;
  bytes: number;
  updatedAt: string;
};
type Status = {
  configured: boolean;
  status: {
    completed_at: string | null;
    verified_at: string | null;
    last_error: string | null;
    files: number | null;
    bytes: number | null;
  };
  snapshots: Snapshot[];
};
const endpoint = "/api/admin/file-recovery";
async function read<T>(url = endpoint): Promise<T> {
  const r = await fetch(url, { cache: "no-store" }),
    d = await r.json();
  if (!r.ok) throw Error(d.error || "Recovery is unavailable.");
  return d;
}
export function FileRecovery() {
  const [data, setData] = useState<Status | null>(null),
    [snapshot, setSnapshot] = useState(""),
    [files, setFiles] = useState<FileEntry[]>([]),
    [fileId, setFileId] = useState(""),
    [reason, setReason] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const load = useCallback(async () => {
    try {
      setData(await read<Status>());
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Recovery is unavailable.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function choose(name: string) {
    setSnapshot(name);
    setFileId("");
    setFiles([]);
    setConfirmation("");
    if (!name) return;
    try {
      setFiles(
        (
          await read<{ files: FileEntry[] }>(
            `${endpoint}?snapshot=${encodeURIComponent(name)}`,
          )
        ).files,
      );
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Recovery copy is unavailable.",
      );
    }
  }
  async function action(body: unknown) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error || "Recovery operation failed.");
      setMessage(
        d.message || `Backup complete: ${d.files} files; restore check passed.`,
      );
      setConfirmation("");
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Recovery operation failed.");
    } finally {
      setBusy(false);
    }
  }
  const completed = data?.status.completed_at;
  return (
    <section className="panel" aria-labelledby="file-recovery-title">
      <h2 id="file-recovery-title">File recovery</h2>
      <p>
        Daily encrypted recovery copies are held privately in Sydney, separately
        from Supabase. Snapshots are available for 30 days. Only missing files
        with an existing document reference can be restored here.
      </p>
      <p>
        {completed
          ? `Last complete backup: ${new Date(completed).toLocaleString("en-AU")} · ${data?.status.files} files.`
          : "No completed backup recorded yet."}
      </p>
      {data?.status.last_error && (
        <p role="alert">
          The latest backup did not complete. Investigate before relying on
          recovery.
        </p>
      )}
      {completed && Date.now() - Date.parse(completed) > 36 * 3600000 && (
        <p role="alert">
          The most recent complete backup is more than 36 hours old.
        </p>
      )}
      <button
        className="button secondary"
        disabled={busy || !data?.configured}
        onClick={() => void action({ action: "backup" })}
      >
        {busy ? "Working…" : "Back up files now"}
      </button>
      <div className="form-grid">
        <label>
          Recovery snapshot
          <select
            value={snapshot}
            disabled={busy}
            onChange={(e) => void choose(e.target.value)}
          >
            <option value="">Choose a completed snapshot</option>
            {data?.snapshots.map((s) => (
              <option key={s.name} value={s.name}>
                {new Date(s.createdAt).toLocaleString("en-AU")}
              </option>
            ))}
          </select>
        </label>
        <label>
          Missing file
          <select
            value={fileId}
            disabled={busy || !files.length}
            onChange={(e) => setFileId(e.target.value)}
          >
            <option value="">Choose a file</option>
            {files.map((f) => (
              <option key={f.id} value={f.id}>
                {f.bucket} / {f.path} · {Math.ceil(f.bytes / 1024)} KB
              </option>
            ))}
          </select>
        </label>
        <label>
          Reason for restoration
          <input
            value={reason}
            maxLength={1000}
            disabled={busy}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <label>
          Type RESTORE MISSING FILE to confirm
          <input
            value={confirmation}
            disabled={busy}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="off"
          />
        </label>
      </div>
      <p>
        Existing files are never overwritten. Deleted account or document
        records require the separate database recovery process; do not reverse a
        valid deletion request.
      </p>
      <button
        className="button"
        disabled={
          busy ||
          !fileId ||
          reason.trim().length < 10 ||
          confirmation !== "RESTORE MISSING FILE"
        }
        onClick={() =>
          void action({
            action: "restore",
            snapshot,
            fileId,
            reason,
            confirmation,
          })
        }
      >
        Restore missing file
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
