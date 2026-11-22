"use client";
import { useEffect, useState } from "react";
import { Receipt } from "lucide-react";
type Data = {
  invoices: {
    id: string;
    number: string | null;
    status: string;
    total: number;
    currency: string;
    date: number;
    url: string | null;
    pdf: string | null;
  }[];
  nextCursor: string | null;
};
export function InvoiceHistory({ organisation }: { organisation: string }) {
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const cursor = cursors[page];
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    const params = new URLSearchParams();
    if (organisation) params.set("organisation", organisation);
    if (cursor) params.set("cursor", cursor);
    fetch(`/api/billing/invoices?${params}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const d = await response.json();
        if (!response.ok) throw Error(d.error);
        if (!controller.signal.aborted) setData(d);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Invoices could not be loaded.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [organisation, cursor]);
  return (
    <section className="panel" aria-busy={busy}>
      <h3>
        <Receipt size={20} /> Invoice history
      </h3>
      <p className="fineprint">
        Invoices billed to your account, including previous business billing
        streams. Businesses you manage by invitation are excluded.
      </p>
      {error && (
        <p role="alert" className="message">
          {error}
        </p>
      )}
      {busy && <p role="status">Loading invoices…</p>}
      {!busy &&
        !error &&
        data &&
        (data.invoices.length ? (
          <div className="billing-invoices">
            {data.invoices.map((i) => (
              <div key={i.id}>
                <span>
                  {i.number || "Invoice"} ·{" "}
                  {new Date(i.date * 1000).toLocaleDateString("en-AU")} ·{" "}
                  {i.status}
                </span>
                <strong>
                  {new Intl.NumberFormat("en-AU", {
                    style: "currency",
                    currency: i.currency.toUpperCase(),
                  }).format(i.total / 100)}
                </strong>
                {i.url && (
                  <a href={i.url} target="_blank" rel="noopener noreferrer">
                    View invoice ↗
                  </a>
                )}
                {i.pdf && (
                  <a href={i.pdf} target="_blank" rel="noopener noreferrer">
                    PDF ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No invoices yet.</p>
        ))}
      {(page > 0 || data?.nextCursor) && (
        <nav className="record-pagination" aria-label="Invoice history pages">
          <button
            className="button secondary small"
            disabled={busy || page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span aria-live="polite">Page {page + 1}</span>
          <button
            className="button secondary small"
            disabled={busy || !!error || !data?.nextCursor}
            onClick={() => {
              setCursors((old) => [
                ...old.slice(0, page + 1),
                data!.nextCursor,
              ]);
              setPage((p) => p + 1);
            }}
          >
            Next
          </button>
        </nav>
      )}
    </section>
  );
}
