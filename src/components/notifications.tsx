"use client";

import Link from "next/link";
import { Bell, CheckCheck, FileCheck2, ArrowRight, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { useSession } from "./providers";

export type Notice = {
  category?: "account" | "billing";
  id: string;
  title: string;
  message: string;
  path: string;
  read_at: string | null;
  created_at: string;
};
type NotificationState = {
  items: Notice[];
  unread: number;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  markRead: (id?: string) => Promise<void>;
  clear: (id?: string) => Promise<void>;
  revision: number;
};
const NotificationContext = createContext<NotificationState>({
  items: [],
  unread: 0,
  loading: false,
  error: "",
  refresh: async () => {},
  markRead: async () => {},
  clear: async () => {},
  revision: 0,
});

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = useSession();
  const [owner, setOwner] = useState(session.user?.id);
  const [items, setItems] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(Boolean(session.user));
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (!session.user || document.visibilityState === "hidden") return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch("/api/notifications?preview=1", {
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || "Notifications are temporarily unavailable.",
        );
      if (!controller.signal.aborted) {
        setItems(data.notifications ?? []);
        setUnread(data.unread ?? 0);
        setError("");
        setRevision((value) => value + 1);
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "Notifications are temporarily unavailable.",
        );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [session.user?.id]);
  useEffect(() => {
    setItems([]);
    setUnread(0);
    setError("");
    setOwner(session.user?.id);
    setLoading(Boolean(session.user));
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      request.current?.abort();
      clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);
  const update = useCallback(
    async (action: "read" | "clear", id?: string) => {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(id ? { id } : {}) }),
      });
      if (!response.ok)
        throw new Error("Your notification could not be updated. Try again.");
      await refresh();
    },
    [refresh],
  );
  const markRead = useCallback((id?: string) => update("read", id), [update]);
  const clear = useCallback((id?: string) => update("clear", id), [update]);
  const current = owner === session.user?.id;
  return (
    <NotificationContext.Provider
      value={{
        items: current ? items : [],
        unread: current ? unread : 0,
        loading: Boolean(session.user) && (!current || loading),
        error: current ? error : "",
        refresh,
        markRead,
        clear,
        revision,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function NotificationPreview() {
  const { items, unread, loading, error, refresh, clear } =
    useContext(NotificationContext);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function dismiss(id?: string) {
    setBusy(true);
    try {
      await clear(id);
      setMessage("");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div
      className="notification-preview"
      ref={ref}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        className="icon-button notification-trigger"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen(!open);
          if (!open) void refresh();
        }}
      >
        <Bell size={20} aria-hidden="true" />
        {unread > 0 && (
          <span className="notification-count" aria-hidden="true">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <section
          id={id}
          className="notification-popover"
          aria-label="Recent notifications"
        >
          <div className="notification-popover-heading">
            <div>
              <h2>Notifications</h2>
              <p>
                {unread
                  ? `${unread} unread update${unread === 1 ? "" : "s"}`
                  : "A little more clarity."}
              </p>
            </div>
            <button
              className="icon-button"
              type="button"
              aria-label="Close notifications"
              onClick={() => {
                setOpen(false);
                button.current?.focus();
              }}
            >
              <X size={18} />
            </button>
          </div>
          {items.length > 0 && (
            <button
              className="text-button notification-clear-all"
              disabled={busy}
              onClick={() => void dismiss()}
            >
              Clear menu
            </button>
          )}
          {message && <p role="status">{message}</p>}
          {loading ? (
            <p role="status">Loading your updates…</p>
          ) : error ? (
            <p role="status">{error}</p>
          ) : items.length ? (
            <ul className="notification-preview-list">
              {items.slice(0, 4).map((notice) => (
                <li key={notice.id}>
                  <Link
                    href={`/account?tab=notifications#notification-${notice.id}`}
                    onClick={() => setOpen(false)}
                  >
                    <span
                      className={
                        notice.read_at ? "notice-dot read" : "notice-dot"
                      }
                      aria-label={notice.read_at ? "Read" : "Unread"}
                    />
                    <div>
                      {notice.category === "billing" && (
                        <FileCheck2
                          size={20}
                          className="billing-notice-icon"
                          aria-label="Billing confirmation"
                        />
                      )}
                      <strong>{notice.title}</strong>
                      <p>{notice.message}</p>
                      <time dateTime={notice.created_at}>
                        {new Date(notice.created_at).toLocaleDateString(
                          "en-AU",
                          { day: "numeric", month: "short" },
                        )}
                      </time>
                    </div>
                  </Link>
                  <button
                    type="button"
                    className="icon-button notification-dismiss"
                    aria-label={`Clear ${notice.title} from menu`}
                    disabled={busy}
                    onClick={() => void dismiss(notice.id)}
                  >
                    <X size={15} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="notification-empty">
              <CheckCheck size={28} />
              <p>You’re up to date.</p>
              <small>
                Application activity and account updates will appear here.
              </small>
            </div>
          )}
          <Link
            className="notification-view-all"
            href="/account?tab=notifications"
            onClick={() => setOpen(false)}
          >
            All notifications <ArrowRight size={16} />
          </Link>
        </section>
      )}
    </div>
  );
}

export function Notifications() {
  const session = useSession();
  const state = useContext(NotificationContext);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{
    owner?: string;
    items: Notice[];
    pages: number;
    total: number;
    page: number;
  }>({ items: [], pages: 1, total: 0, page: 1 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    setPage(1);
  }, [session.user?.id]);
  useEffect(() => {
    if (!session.user) return;
    const controller = new AbortController();
    setLoading(true);
    void (async () => {
      try {
        const response = await fetch(`/api/notifications?page=${page}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok)
          throw Error(body.error || "Your notifications could not be loaded.");
        if (!controller.signal.aborted) {
          if (page > body.pages) {
            setPage(body.pages);
            return;
          }
          setData({
            owner: session.user!.id,
            items: body.notifications,
            pages: body.pages,
            total: body.total,
            page,
          });
          setMessage("");
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setMessage(cause instanceof Error ? cause.message : "Try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [session.user?.id, page, state.revision]);
  async function mark(id?: string) {
    setBusy(true);
    try {
      await state.markRead(id);
      setMessage("");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }
  if (session.loading) return <p role="status">Loading notifications…</p>;
  if (!session.user)
    return (
      <div className="panel">
        <h2>Your notifications</h2>
        <p>Sign in to see your account updates.</p>
        <button className="button primary" onClick={session.openAuth}>
          Sign in
        </button>
      </div>
    );
  const current = data.owner === session.user.id;
  const items = current && data.page === page ? data.items : [];
  const pageNumbers = [...new Set([1, page - 1, page, page + 1, data.pages])]
    .filter((n) => n >= 1 && n <= data.pages)
    .sort((a, b) => a - b);
  return (
    <section className="panel profile-notifications" aria-busy={loading}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Your activity, kept close</p>
          <h2>Your notifications.</h2>
        </div>
        {state.unread > 0 && (
          <button
            className="button secondary small"
            disabled={busy}
            onClick={() => void mark()}
          >
            <CheckCheck size={16} />
            Mark all read
          </button>
        )}
      </div>
      <p className="muted">
        Your complete account and application history, including updates cleared
        from the bell menu. An application view records an intentional opening,
        rather than a full assessment.
      </p>
      {message && (
        <p role="status" className="message">
          {message}{" "}
          <button className="text-button" onClick={() => void state.refresh()}>
            Try again
          </button>
        </p>
      )}
      {loading && !items.length ? (
        <p role="status">Loading notifications…</p>
      ) : items.length ? (
        <ul className="notification-list">
          {items.map((notice) => (
            <li
              key={notice.id}
              id={`notification-${notice.id}`}
              className={notice.read_at ? "read" : "unread"}
            >
              <div>
                {notice.category === "billing" && (
                  <FileCheck2
                    size={24}
                    className="billing-notice-icon"
                    aria-label="Billing confirmation"
                  />
                )}
                <span className="badge">{notice.read_at ? "Read" : "New"}</span>
                <h3>{notice.title}</h3>
                <p>{notice.message}</p>
                <time className="fineprint" dateTime={notice.created_at}>
                  {new Date(notice.created_at).toLocaleString("en-AU")}
                </time>
                <Link className="text-link" href={notice.path}>
                  View related activity <ArrowRight size={14} />
                </Link>
              </div>
              {!notice.read_at && (
                <button
                  className="button secondary small"
                  disabled={busy}
                  onClick={() => void mark(notice.id)}
                >
                  Mark read
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        !message && (
          <div className="notification-empty">
            <Bell size={32} />
            <h3>You’re up to date.</h3>
            <p>New activity will appear here.</p>
          </div>
        )
      )}
      {current && data.pages > 1 && (
        <nav
          className="notification-pagination"
          aria-label="Notification pages"
        >
          <button
            type="button"
            className="button secondary small"
            disabled={page === 1 || loading}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          {pageNumbers.map((n, i) => (
            <span key={n}>
              {i > 0 && n > pageNumbers[i - 1] + 1 && (
                <span className="pagination-gap" aria-hidden="true">
                  …
                </span>
              )}
              <button
                type="button"
                className="button secondary small"
                aria-label={`Page ${n}`}
                aria-current={page === n ? "page" : undefined}
                disabled={loading}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            </span>
          ))}
          <button
            type="button"
            className="button secondary small"
            disabled={page === data.pages || loading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </nav>
      )}
      {current && (
        <p className="fineprint">
          Page {page} of {data.pages} · {data.total} updates
        </p>
      )}
    </section>
  );
}
