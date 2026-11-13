"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  X,
  Mail,
  ArrowRight,
  LoaderCircle,
  Check,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";

type Profile = {
  configured: boolean;
  user: { id: string; email?: string } | null;
  isPremium: boolean;
};
type SessionValue = Profile & {
  openAuth: () => void;
  refresh: () => Promise<void>;
};
const SessionContext = createContext<SessionValue>({
  configured: false,
  user: null,
  isPremium: false,
  openAuth: () => {},
  refresh: async () => {},
});
export const useSession = () => useContext(SessionContext);

export function Providers({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile>({
    configured: false,
    user: null,
    isPremium: false,
  });
  const [authOpen, setAuthOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const modalRef = useRef<HTMLElement>(null);
  const authTriggerRef = useRef<HTMLElement | null>(null);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/profile", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        setProfile({
          configured: Boolean(data.configured),
          user: data.user ?? null,
          isPremium: data.isPremium === true,
        });
      } else
        setProfile((previous) => ({
          ...previous,
          user: null,
          isPremium: false,
        }));
    } catch {
      setProfile((previous) => ({ ...previous, user: null, isPremium: false }));
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("auth") !== "expired") return;
    setStatus(
      "That sign-in link couldn’t be completed. Request a fresh link below.",
    );
    setAuthOpen(true);
    url.searchParams.delete("auth");
    window.history.replaceState(
      window.history.state,
      "",
      url.pathname + url.search + url.hash,
    );
  }, []);
  useEffect(() => {
    if (!authOpen) return;
    const previous = authTriggerRef.current;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAuthOpen(false);
      if (event.key === "Tab") {
        const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]),input:not([disabled]),a[href]",
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("keydown", close);
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
  }, [authOpen]);
  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const r = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await r.json();
      setStatus(
        r.ok
          ? "Check your email for your secure sign-in link."
          : data.error || "Sign-in is temporarily unavailable.",
      );
    } catch {
      setStatus("We couldn’t connect. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <SessionContext.Provider
      value={{
        ...profile,
        openAuth: () => {
          authTriggerRef.current = document.activeElement as HTMLElement | null;
          setStatus("");
          setAuthOpen(true);
        },
        refresh,
      }}
    >
      {children}
      {authOpen && (
        <div className="modal-backdrop" onClick={() => setAuthOpen(false)}>
          <section
            ref={modalRef}
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="signin-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="icon-button modal-close"
              onClick={() => setAuthOpen(false)}
              aria-label="Close sign in"
            >
              <X size={20} />
            </button>
            <div className="round-icon">
              <Mail size={24} />
            </div>
            <p className="eyebrow">A little closer to your next chapter</p>
            <h2 id="signin-title">Welcome to Westmere.</h2>
            <p className="muted">
              Sign in or create an account with a secure email link. No password
              to remember.
            </p>
            <form onSubmit={signIn}>
              <label className="field-label" htmlFor="signin-email">
                Email address
              </label>
              <input
                id="signin-email"
                type="email"
                autoComplete="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
              <button className="button primary full" disabled={busy}>
                {busy ? (
                  <LoaderCircle className="spin" size={18} />
                ) : (
                  <Mail size={18} />
                )}
                Email me a sign-in link
                <ArrowRight size={17} />
              </button>
            </form>
            {status && (
              <p role="status" className="message">
                {status}
              </p>
            )}
            <p className="fineprint">
              Your profile and CV stay private unless you choose to share them
              in an application.
            </p>
          </section>
        </div>
      )}
    </SessionContext.Provider>
  );
}

export function ThemeToggle() {
  const [theme, setTheme] = useState("system");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("westmere-theme");
      setTheme(saved === "light" || saved === "dark" ? saved : "system");
    } catch {
      setTheme("system");
    }
  }, []);
  function cycle() {
    const next =
      theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    setTheme(next);
    try {
      localStorage.setItem("westmere-theme", next);
    } catch {}
    document.documentElement.dataset.theme = next;
  }
  const Icon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor;
  return (
    <button
      type="button"
      className="icon-button theme-button"
      onClick={cycle}
      aria-label={`Appearance: ${theme}. Change appearance.`}
      title={`Appearance: ${theme}`}
    >
      <Icon size={18} />
      <span className="theme-label">
        {theme === "system" ? "Auto" : theme === "light" ? "Light" : "Dark"}
      </span>
    </button>
  );
}

export function SaveButton({
  id,
  compact = false,
}: {
  id: string;
  compact?: boolean;
}) {
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    try {
      setSaved(
        (
          JSON.parse(localStorage.getItem("westmere-saved") || "[]") as string[]
        ).includes(id),
      );
    } catch {}
  }, [id]);
  function toggle() {
    let ids: string[] = [];
    try {
      ids = JSON.parse(localStorage.getItem("westmere-saved") || "[]");
    } catch {}
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    try {
      localStorage.setItem("westmere-saved", JSON.stringify(next));
      setSaved(next.includes(id));
      window.dispatchEvent(new Event("westmere-saved"));
    } catch {}
  }
  return (
    <button
      className={compact ? "save-icon" : "button secondary"}
      aria-label={saved ? "Remove saved role" : "Save role on this device"}
      aria-pressed={saved}
      onClick={toggle}
      type="button"
    >
      {saved ? (
        <Check size={18} />
      ) : (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <path d="M6 4h12v17l-6-4-6 4z" />
        </svg>
      )}
      {!compact && (saved ? "Saved" : "Save role")}
    </button>
  );
}
