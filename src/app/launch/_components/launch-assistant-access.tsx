"use client";
import Link from "next/link";
import { useSession } from "@/components/providers";
export function LaunchAssistantAccess() {
  const session = useSession();
  if (session.loading || !session.user) return null;
  return (
    <section className="panel founding-assistant-access">
      <h2>
        {session.isPremium
          ? "Your Studio is ready."
          : "Your free Assistant allowance is ready."}
      </h2>
      <p>
        {session.isPremium
          ? "Your existing plan’s Studio tools remain available."
          : "Every signed-in account, including employer and agency accounts, retains three free Assistant requests. Previous completed requests count towards this allowance."}
      </p>
      <Link className="button secondary" href="/studio">
        {session.isPremium ? "Open Careers+ Studio" : "Open Westmere Assistant"}
      </Link>
    </section>
  );
}
