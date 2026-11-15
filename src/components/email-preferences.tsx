"use client";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
export function EmailPreferences() {
  const token = useSearchParams().get("token") || "";
  const valid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      token,
    );
  return (
    <section className="panel">
      <h1>A little less in your inbox.</h1>
      <p>
        Pause job alerts for this saved search. Your account, other searches and
        essential sign-in emails are unchanged.
      </p>
      {valid ? (
        <form
          method="post"
          action={`https://ldmwqupidlgrkkjjpcvn.supabase.co/functions/v1/westmere-alerts/unsubscribe?token=${token}`}
        >
          <button className="button primary" type="submit">
            Unsubscribe from this search
          </button>
        </form>
      ) : (
        <p className="notice">
          Open the unsubscribe link from your Westmere job-alert email, or
          manage alerts from your account.
        </p>
      )}
      <Link
        href="https://westmere-careers-git-codex-staging-order-ward.vercel.app/saved-searches"
        className="text-link"
      >
        Manage all saved searches →
      </Link>
    </section>
  );
}
