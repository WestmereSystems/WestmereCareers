"use client";
import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
export function ConfirmAction({
  title,
  children,
  confirmLabel,
  businessName,
  onConfirm,
  onClose,
  danger = false,
}: {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  businessName?: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
  danger?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal confirmation-dialog danger-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <button
        type="button"
        className="icon-button modal-close"
        onClick={onClose}
        disabled={busy}
        aria-label="Cancel"
      >
        <X size={20} />
      </button>
      <h2 id={`${id}-title`}>{title}</h2>
      <div id={`${id}-description`}>{children}</div>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (businessName && name !== businessName) return;
          setBusy(true);
          setError("");
          try {
            await onConfirm();
            onClose();
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "The change could not be completed.",
            );
            setBusy(false);
          }
        }}
      >
        {businessName && (
          <label className="field-label">
            Type <strong>{businessName}</strong> to confirm
            <input
              autoComplete="off"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              spellCheck={false}
            />
          </label>
        )}
        {error && (
          <p className="message error-message" role="alert">
            {error}
          </p>
        )}
        <div className="actions-row">
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className={`button ${danger ? "danger" : "primary"}`}
            disabled={busy || Boolean(businessName && name !== businessName)}
          >
            {busy ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
