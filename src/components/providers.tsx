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
import { NotificationProvider } from "./notifications";

type Profile = {
  configured: boolean;
  user: { id: string; email?: string; fullName?: string } | null;
  sampleWorkspace?: boolean;
  isPremium: boolean;
  loading: boolean;
  staffRole: "reviewer" | "admin" | null;
};
type SessionValue = Profile & {
  openAuth: () => void;
  refresh: () => Promise<void>;
  savedIds: string[];
  toggleSaved: (id: string) => Promise<void>;
};
const SessionContext = createContext<SessionValue>({
  configured: false,
  user: null,
  isPremium: false,
  loading: true,
  staffRole: null,
  openAuth: () => {},
  refresh: async () => {},
  savedIds: [],
  toggleSaved: async () => {},
});
export const useSession = () => useContext(SessionContext);

export function Providers({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile>({
    configured: false,
    user: null,
    isPremium: false,
    loading: true,
    staffRole: null,
  });
  const [authOpen, setAuthOpen] = useState(false);
  const [newAccount, setNewAccount] = useState(false);
  const [fullName, setFullName] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [authProviders, setAuthProviders] = useState({
    google: false,
    azure: false,
  });
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const modalRef = useRef<HTMLElement>(null);
  const authTriggerRef = useRef<HTMLElement | null>(null);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/session", { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        setProfile({
          configured: Boolean(data.configured),
          user: data.user ?? null,
          sampleWorkspace: data.sampleWorkspace === true,
          isPremium: data.isPremium === true,
          loading: false,
          staffRole: ["reviewer", "admin"].includes(data.staffRole)
            ? data.staffRole
            : null,
        });
      } else
        setProfile((previous) => ({
          ...previous,
          user: null,
          isPremium: false,
          loading: false,
          staffRole: null,
        }));
    } catch {
      setProfile((previous) => ({
        ...previous,
        user: null,
        isPremium: false,
        loading: false,
        staffRole: null,
      }));
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("auth") !== "expired") return;
    setStatus(
      "That sign-in couldn’t be completed. Request an email code below.",
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
  useEffect(() => {
    if (!authOpen) return;
    const c = new AbortController();
    fetch("/api/auth/options", { signal: c.signal })
      .then((r) => r.json())
      .then((d) => {
        if (!c.signal.aborted)
          setAuthProviders({
            google: d.google === true,
            azure: d.azure === true,
          });
      })
      .catch(() => {});
    return () => c.abort();
  }, [authOpen]);
  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const r = await fetch(
        codeSent ? "/api/auth/verify" : "/api/auth/sign-in",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            ...(codeSent ? { code } : {}),
            ...(newAccount ? { fullName } : {}),
          }),
        },
      );
      const data = await r.json();
      if (r.ok && codeSent) {
        window.location.assign("/account");
        return;
      }
      if (r.ok) {
        setCodeSent(true);
        setStatus("Enter the newest sign-in code from your inbox.");
      } else setStatus(data.error || "Sign-in is temporarily unavailable.");
    } catch {
      setStatus("We couldn’t connect. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!profile.user) {
      setSavedIds([]);
      return;
    }
    const c = new AbortController();
    fetch("/api/jobs/saved?idsOnly=1", { cache: "no-store", signal: c.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && !c.signal.aborted) setSavedIds(d.ids || []);
      })
      .catch(() => {});
    return () => c.abort();
  }, [profile.user?.id]);
  async function toggleSaved(id: string) {
    if (!profile.user) {
      setAuthOpen(true);
      return;
    }
    const saved = !savedIds.includes(id);
    const r = await fetch("/api/jobs/saved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, saved }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "This role could not be saved.");
    setSavedIds((previous) =>
      saved
        ? [...new Set([...previous, id])]
        : previous.filter((x) => x !== id),
    );
    window.dispatchEvent(new Event("westmere-saved"));
  }
  async function oauth(provider: "google" | "azure") {
    setBusy(true);
    try {
      const r = await fetch("/api/auth/oauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const d = await r.json();
      if (r.ok && d.url) window.location.assign(d.url);
      else setStatus(d.error);
    } catch {
      setStatus("Sign-in could not be started. Try an email code.");
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
        savedIds,
        toggleSaved,
      }}
    >
      <NotificationProvider>{children}</NotificationProvider>
      {profile.user && !profile.user.fullName && !profile.loading && (
        <NameOnboarding onComplete={refresh} />
      )}
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
              Sign in with a one-time email code. No password to remember.
            </p>
            {!codeSent && (
              <>
                <div className="auth-options">
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy || !authProviders.google}
                    onClick={() => void oauth("google")}
                  >
                    Continue with Google
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy || !authProviders.azure}
                    onClick={() => void oauth("azure")}
                  >
                    Continue with Microsoft
                  </button>
                </div>
                <p className="fineprint">
                  {!authProviders.google && !authProviders.azure
                    ? "Google and Microsoft sign-in are being connected. Email codes are available below."
                    : "Or use your email"}
                </p>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={newAccount}
                    onChange={(e) => setNewAccount(e.target.checked)}
                  />
                  I’m creating a new account
                </label>
              </>
            )}
            <form onSubmit={signIn}>
              {newAccount && !codeSent && (
                <label className="field-label">
                  Your name
                  <input
                    autoComplete="name"
                    required
                    maxLength={120}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </label>
              )}
              <label className="field-label" htmlFor="signin-email">
                Email address
              </label>
              <input
                id="signin-email"
                type="email"
                autoComplete="email"
                required
                autoFocus
                readOnly={codeSent}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
              {codeSent && (
                <label className="field-label" htmlFor="signin-code">
                  Sign-in code
                  <input
                    id="signin-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6,8}"
                    minLength={6}
                    maxLength={8}
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  />
                </label>
              )}
              <button className="button primary full" disabled={busy}>
                {busy ? (
                  <LoaderCircle className="spin" size={18} />
                ) : (
                  <Mail size={18} />
                )}
                {codeSent
                  ? "Verify code and sign in"
                  : "Email me a sign-in code"}
                <ArrowRight size={17} />
              </button>
            </form>
            {codeSent && (
              <button
                className="text-button"
                type="button"
                disabled={busy}
                onClick={() => {
                  setCodeSent(false);
                  setCode("");
                  setStatus("");
                }}
              >
                Change email or request a new code
              </button>
            )}
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
  const [theme, setTheme] = useState("dark");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("westmere-theme");
      setTheme(saved === "light" || saved === "system" ? saved : "dark");
    } catch {
      setTheme("dark");
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
  const session = useSession();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const saved = session.user ? session.savedIds.includes(id) : false;
  async function toggle() {
    if (!session.user) {
      session.openAuth();
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await session.toggleSaved(id);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "We couldn’t save this role.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      className={compact ? "save-icon" : "button secondary"}
      aria-label={saved ? "Remove saved role" : "Save role to your account"}
      title={message || undefined}
      disabled={busy || session.loading}
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
      {message && (
        <span className="sr-only" role="alert">
          {message}
        </span>
      )}
    </button>
  );
}

function NameOnboarding({ onComplete }: { onComplete: () => Promise<void> }) {
  const [name, setName] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    ref.current?.querySelector("input")?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const nodes = ref.current?.querySelectorAll<HTMLElement>(
        "input,button,a[href]",
      );
      if (!nodes?.length) return;
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      before?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop">
      <section
        ref={ref}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
      >
        <p className="eyebrow">Make yourself at home</p>
        <h2 id="onboarding-title">What should we call you?</h2>
        <p>
          Add your name to finish your profile. Your profile stays private; it
          is shared only when you choose to apply.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const r = await fetch("/api/profile", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ fullName: name }),
                }),
                d = await r.json();
              if (!r.ok) throw new Error(d.error);
              await onComplete();
            } catch (e) {
              setMessage(
                e instanceof Error
                  ? e.message
                  : "Your name could not be saved.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field-label" htmlFor="onboarding-name">
            Your name
            <input
              id="onboarding-name"
              autoComplete="name"
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button className="button primary full" disabled={busy}>
            Continue to Westmere <ArrowRight size={17} />
          </button>
        </form>
        {message && (
          <p role="alert" className="message">
            {message}
          </p>
        )}
        <p className="fineprint">
          New accounts receive one welcome email. Job alerts are a separate
          choice.
        </p>
        <button
          className="text-button"
          disabled={busy}
          onClick={async () => {
            const r = await fetch("/api/auth/sign-out", { method: "POST" });
            if (r.ok) await onComplete();
            else setMessage("We couldn’t sign you out. Please try again.");
          }}
        >
          Sign out
        </button>
      </section>
    </div>
  );
}
