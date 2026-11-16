"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "./providers";
export type AssistantAllowance = {
  tier: "Guest" | "Free account" | "Careers+";
  remaining: number;
  cap: number;
  renewsAt?: string;
};
export function useAssistantAllowance() {
  const session = useSession();
  const [allowance, setAllowance] = useState<AssistantAllowance | null>(null);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
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
  }, [
    session.loading,
    session.user?.id,
    session.isPremium,
    Boolean(session.business),
  ]);
  useEffect(() => {
    setAllowance(null);
    void refresh();
    return () => controller.current?.abort();
  }, [refresh]);
  return { allowance, error, refresh };
}
