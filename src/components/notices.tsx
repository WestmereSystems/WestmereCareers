"use client";
import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { X, Info, ShieldAlert } from "lucide-react";
export type AppNotice = {
  title: string;
  message: string;
  tone?: "info" | "error";
  href?: string;
  label?: string;
};
const NoticeContext = createContext<(notice: AppNotice) => void>(() => {});
export const useNotice = () => useContext(NoticeContext);
export const individualNotice: AppNotice = {
  title: "Careers+ is for your personal account",
  message:
    "Your employer account is for hiring. Sign in with a separate personal account to upload a CV, request a review or subscribe to Careers+. Your company workspace stays separate.",
  href: "/account?tab=dashboard",
  label: "Open hiring dashboard",
};
export function NoticeProvider({ children }: { children: React.ReactNode }) {
  const [notice, setNotice] = useState<AppNotice | null>(null);
  const show = useCallback((n: AppNotice) => setNotice(n), []);
  return (
    <NoticeContext.Provider value={show}>
      {children}
      {notice && (
        <NoticeDialog notice={notice} onClose={() => setNotice(null)} />
      )}
    </NoticeContext.Provider>
  );
}
function NoticeDialog({
  notice,
  onClose,
}: {
  notice: AppNotice;
  onClose: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
      }
      if (e.key === "Tab") {
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          "button:not([disabled]),a[href]",
        );
        if (!nodes?.length) return;
        e.stopImmediatePropagation();
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("keydown", key, true);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div className="app-notice-backdrop" onClick={onClose}>
      <section
        className={`app-notice ${notice.tone === "error" ? "error-notice" : ""}`}
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="app-notice-title"
        aria-describedby="app-notice-description"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="icon-button modal-close"
          aria-label="Close notice"
          onClick={onClose}
        >
          <X size={19} />
        </button>
        <span className="round-icon">
          {notice.tone === "error" ? <ShieldAlert /> : <Info />}
        </span>
        <h2 id="app-notice-title">{notice.title}</h2>
        <p id="app-notice-description">{notice.message}</p>
        <div className="actions-row">
          {notice.href && (
            <Link
              href={notice.href}
              className="button secondary"
              onClick={onClose}
            >
              {notice.label || "Continue"}
            </Link>
          )}
          <button className="button primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </section>
    </div>
  );
}
