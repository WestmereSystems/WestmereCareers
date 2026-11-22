"use client";
import { useEffect, useRef, useState } from "react";
type CV = { id: string; filename: string };
export function ApplicationCV({
  value,
  cvId,
  onChange,
  onBusyChange,
}: {
  value: string;
  cvId: string | null;
  onChange: (text: string, id: string | null, filename?: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [cvs, setCVs] = useState<CV[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const changed = useRef(Boolean(value));
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/profile", {
        cache: "no-store",
        signal: controller.signal,
      }).then((r) =>
        r.ok
          ? r.json()
          : Promise.reject(Error("Your saved CV could not be loaded.")),
      ),
      fetch("/api/profile/cvs", {
        cache: "no-store",
        signal: controller.signal,
      }).then((r) =>
        r.ok
          ? r.json()
          : Promise.reject(Error("Your CV library could not be loaded.")),
      ),
    ])
      .then(async ([profile, library]) => {
        if (controller.signal.aborted) return;
        setCVs(library.cvs || []);
        if (
          !changed.current &&
          (profile.profile?.active_cv_id || profile.profile?.cv_text)
        ) {
          let text = profile.profile.cv_text || "";
          if (profile.profile.active_cv_id) {
            // Review the selected file's authoritative text, including for
            // accounts that previously edited their separate base-CV text.
            const response = await fetch(
              `/api/profile/cvs?id=${profile.profile.active_cv_id}&text=1`,
              { cache: "no-store", signal: controller.signal },
            );
            const selected = await response.json();
            if (!response.ok)
              throw Error(
                selected.error || "Your selected CV could not be loaded.",
              );
            text = selected.text;
          }
          if (controller.signal.aborted || changed.current) return;
          onChangeRef.current(
            text,
            profile.profile.active_cv_id || null,
            library.cvs?.find(
              (cv: CV) => cv.id === profile.profile.active_cv_id,
            )?.filename,
          );
          setMessage(
            "Your account CV is ready. Review it and confirm sharing before submitting.",
          );
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setMessage(e.message);
      });
    return () => controller.abort();
  }, []);
  async function choose(id: string) {
    changed.current = true;
    if (!id) {
      onChange(value, null);
      return;
    }
    setBusy(true);
    onBusyChange(true);
    try {
      const r = await fetch(`/api/profile/cvs?id=${id}&text=1`, {
        cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      onChange(d.text, id, d.filename);
      setMessage(
        `${d.filename} selected. Its original file and the reviewed text will be shared.`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "CV unavailable.");
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  return (
    <div className="application-cv">
      <label className="field-label">
        CV from your account
        <select
          value={cvId || ""}
          disabled={busy}
          onChange={(e) => void choose(e.target.value)}
        >
          <option value="">CV text only · paste or edit below</option>
          {cvs.map((cv) => (
            <option key={cv.id} value={cv.id}>
              {cv.filename}
            </option>
          ))}
        </select>
      </label>
      <label className="field-label">
        Or upload a new CV · PDF or Word, up to 4 MB
        <input
          type="file"
          accept=".pdf,.docx"
          disabled={busy}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const input = event.target;
            changed.current = true;
            setBusy(true);
            onBusyChange(true);
            try {
              const body = new FormData();
              body.set("file", file);
              const r = await fetch("/api/profile/cvs", {
                method: "POST",
                body,
              });
              const d = await r.json();
              if (!r.ok) throw Error(d.error);
              setCVs((previous) => [
                { id: d.id, filename: file.name },
                ...previous,
              ]);
              onChange(d.text, d.id, file.name);
              setMessage(
                "New CV uploaded privately and selected for this application. Your account’s base CV is unchanged.",
              );
            } catch (e) {
              setMessage(e instanceof Error ? e.message : "Upload failed.");
            } finally {
              input.value = "";
              setBusy(false);
              onBusyChange(false);
            }
          }}
        />
      </label>
      <label className="field-label" htmlFor="application-cv">
        Review the CV text
        <textarea
          id="application-cv"
          required
          minLength={50}
          maxLength={40000}
          value={value}
          disabled={busy}
          onChange={(e) => {
            changed.current = true;
            onChange(e.target.value, null);
            setMessage(
              "Edited CV text will be shared. To attach the original file, select a saved CV again.",
            );
          }}
        />
      </label>
      {busy && <p role="status">Preparing your CV…</p>}
      {message && (
        <p className="fineprint" role="status">
          {message}
        </p>
      )}
      <p className="fineprint">
        Selected files are copied into the submitted application, so later
        changes to your CV library do not alter what the employer receives.
      </p>
    </div>
  );
}
