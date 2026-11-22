"use client";
import { useEffect, useState } from "react";

const changed = "westmere-assistant-consent";

/** Remember a revocable sharing choice for this browser and account only. */
export function useAssistantConsent(userId?: string) {
  const key = `westmere-assistant-sharing-v1:${userId || "guest"}`;
  const [choice, setChoice] = useState({ key: "", accepted: false });
  useEffect(() => {
    function read() {
      let accepted = false;
      try {
        accepted = localStorage.getItem(key) === "accepted";
      } catch {
        // Storage restrictions never prevent an explicit choice in this chat.
      }
      setChoice({ key, accepted });
    }
    read();
    window.addEventListener(changed, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(changed, read);
      window.removeEventListener("storage", read);
    };
  }, [key]);
  function setAccepted(accepted: boolean) {
    try {
      if (accepted) localStorage.setItem(key, "accepted");
      else localStorage.removeItem(key);
      window.dispatchEvent(new Event(changed));
    } catch {
      // Keep the current choice even when this browser blocks storage.
    }
    setChoice({ key, accepted });
  }
  return [choice.key === key && choice.accepted, setAccepted] as const;
}
