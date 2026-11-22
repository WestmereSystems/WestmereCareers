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
export const foundingCareersNotice: AppNotice = {
  title: "Careers+ opens at launch",
  message:
    "Careers+ and Careers+ Studio will be available when Westmere Careers launches: as a separate subscription for applicants (ordinary users), and through Enterprise business or agency subscriptions or higher for the billing owner. Business teams do not inherit a separate applicant subscription.",
  href: "/launch/plans",
  label: "Explore business and agency plans",
};
export const individualNotice: AppNotice = {
  title: "Careers+ is for your personal account",
  message:
    "Use a personal account to access the Careers+ subscription and billing portal. Employer and agency accounts, including Enterprise, manage their business plan in Profile → Billing. Enterprise Studio tools remain available to its billing owner.",
  href: "/account?tab=dashboard",
  label: "Open hiring dashboard",
};
export const careerAccessNotice: AppNotice = {
  title: "Explore the candidate tools",
  message:
    "Use a personal Careers+ account or subscribe to Enterprise on this billing account to explore CV reviews, Role Strength and Strong Matches from a candidate’s perspective. Invited team accounts do not inherit Careers+.",
  href: "/account?tab=billing",
  label: "Review Enterprise",
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
