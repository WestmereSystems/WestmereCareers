"use client";
import { useCallback, useEffect, useRef, useState, useId } from "react";
import { useSession } from "./providers";
export type AssistantAllowance = {
  tier: "Guest" | "Free account" | "Careers+";
  remaining: number;
  cap: number;
  renewsAt?: string;
};
export function useAssistantAllowance() {
  const session = useSession();
  const listenerId = useId();
  const [allowance, setAllowance] = useState<AssistantAllowance | null>(null);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(
    async (broadcast = true) => {
      if (session.loading || session.business) return;
      controller.current?.abort();
      const request = new AbortController();
      controller.current = request;
      try {
        const response = await fetch("/api/assistant", {
          cache: "no-store",
          signal: request.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error || "Your AI allowance is temporarily unavailable.",
          );
        if (!request.signal.aborted) {
          setAllowance(data);
          setError("");
          if (broadcast)
            window.dispatchEvent(
              new CustomEvent("westmere-ai-allowance-change", {
                detail: listenerId,
              }),
            );
        }
      } catch (cause) {
        if (!request.signal.aborted) {
          setAllowance(null);
          setError(
            cause instanceof Error
              ? cause.message
              : "Your AI allowance is temporarily unavailable.",
          );
        }
      }
    },
    [
      session.loading,
      session.user?.id,
      session.isPremium,
      Boolean(session.business),
      listenerId,
    ],
  );
  useEffect(() => {
    setAllowance(null);
    void refresh(false);
    const changed = (event: Event) => {
      if ((event as CustomEvent).detail !== listenerId) void refresh(false);
    };
    window.addEventListener("westmere-ai-allowance-change", changed);
    return () => {
      controller.current?.abort();
      window.removeEventListener("westmere-ai-allowance-change", changed);
    };
  }, [refresh, listenerId]);
  return { allowance, error, refresh };
}
