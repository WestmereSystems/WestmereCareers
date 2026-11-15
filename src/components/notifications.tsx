"use client";

import Link from "next/link";
import { Bell, CheckCheck, ArrowRight, X } from "lucide-react";
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
};
const NotificationContext = createContext<NotificationState>({
  items: [],
  unread: 0,
  loading: false,
  error: "",
  refresh: async () => {},
  markRead: async () => {},
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
  const [loading, setLoading] = useState(Boolean(session.user));
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (!session.user || document.visibilityState === "hidden") return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch("/api/notifications", {
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
  const markRead = useCallback(
    async (id?: string) => {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { id } : {}),
      });
      if (!response.ok)
        throw new Error("This notification could not be marked read.");
      await refresh();
    },
    [refresh],
  );
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
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function NotificationPreview() {
  const { items, unread, loading, error, refresh } =
    useContext(NotificationContext);
  const [open, setOpen] = useState(false);
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
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
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
          {loading ? (
            <p role="status">Loading your updates…</p>
          ) : error ? (
            <p role="status">{error}</p>
          ) : items.length ? (
            <ul className="notification-preview-list">
              {items.slice(0, 4).map((notice) => (
                <li key={notice.id}>
                  <Link href={notice.path} onClick={() => setOpen(false)}>
                    <span
                      className={
                        notice.read_at ? "notice-dot read" : "notice-dot"
                      }
                      aria-label={notice.read_at ? "Read" : "Unread"}
                    />
                    <div>
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
  const [older, setOlder] = useState<Notice[]>([]);
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  // Keep loaded rows when the preview refreshes; new arrivals must not create a gap.
  useEffect(() => {
    setOlder((previous) => [
      ...new Map(
        [...previous, ...state.items].map((notice) => [notice.id, notice]),
      ).values(),
    ]);
  }, [state.items]);
  const items = [
    ...new Map(
      [...older, ...state.items].map((notice) => [notice.id, notice]),
    ).values(),
  ].sort(
    (a, b) =>
      b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
  );
  if (session.loading || state.loading)
    return <p role="status">Loading notifications…</p>;
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
  async function mark(id?: string) {
    setBusy(true);
    try {
      await state.markRead(id);
      setOlder((values) =>
        values.map((notice) =>
          !id || notice.id === id
            ? { ...notice, read_at: new Date().toISOString() }
            : notice,
        ),
      );
      setMessage("");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel profile-notifications">
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
        Application receipts, intentional first views and employer decisions
        appear here. A view confirms that someone opened your application,
        rather than a full assessment.
      </p>
      {state.error && (
        <p className="message" role="status">
          {state.error}{" "}
          <button className="text-button" onClick={() => void state.refresh()}>
            Try again
          </button>
        </p>
      )}
      {items.length ? (
        <ul className="notification-list">
          {items.map((notice) => (
            <li key={notice.id} className={notice.read_at ? "read" : "unread"}>
              <div>
                <span className="badge">{notice.read_at ? "Read" : "New"}</span>
                <h3>{notice.title}</h3>
                <p>{notice.message}</p>
                <time className="fineprint" dateTime={notice.created_at}>
                  {new Date(notice.created_at).toLocaleString("en-AU")}
                </time>
                <Link className="text-link" href={notice.path}>
                  View details <ArrowRight size={14} />
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
        !state.error && (
          <div className="notification-empty">
            <Bell size={32} />
            <h3>You’re up to date.</h3>
            <p>New activity will appear here.</p>
          </div>
        )
      )}
      {more && items.length >= 20 && (
        <button
          className="button secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const last = items.at(-1)!;
              const query = new URLSearchParams({
                before: last.created_at,
                beforeId: last.id,
              });
              const response = await fetch(`/api/notifications?${query}`, {
                cache: "no-store",
              });
              const data = await response.json();
              if (!response.ok) throw new Error(data.error);
              setOlder((previous) => [...previous, ...data.notifications]);
              setMore(data.notifications.length === 20);
            } catch {
              setMessage(
                "Older notifications could not be loaded. Please try again.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Load older notifications
        </button>
      )}
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
