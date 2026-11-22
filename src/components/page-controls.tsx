"use client";
export function PageControls({
  page,
  total,
  size,
  label,
  onPage,
  busy = false,
}: {
  page: number;
  total: number;
  size: number;
  label: string;
  onPage: (page: number) => void;
  busy?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  return (
    <nav className="record-pagination" aria-label={label}>
      <button
        type="button"
        className="button secondary small"
        disabled={busy || page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </button>
      <span aria-live="polite">
        Page {page} of {pages}
      </span>
      <button
        type="button"
        className="button secondary small"
        disabled={busy || page >= pages}
        onClick={() => onPage(page + 1)}
      >
        Next
      </button>
    </nav>
  );
}

export function CursorControls({
  page,
  more,
  busy,
  label,
  onPrevious,
  onNext,
}: {
  page: number;
  more: boolean;
  busy: boolean;
  label: string;
  onPrevious: () => void;
  onNext: () => void;
}) {
  if (!page && !more) return null;
  return (
    <nav className="record-pagination" aria-label={label}>
      <button
        type="button"
        className="button secondary small"
        disabled={busy || page === 0}
        onClick={onPrevious}
      >
        Previous
      </button>
      <span aria-live="polite">Page {page + 1}</span>
      <button
        type="button"
        className="button secondary small"
        disabled={busy || !more}
        onClick={onNext}
      >
        Next
      </button>
    </nav>
  );
}
