import Link from "next/link";
import { z } from "zod";

export const metadata = {
  title: "Unsubscribe from marketing",
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = z.uuid().safeParse(params.token);
  return (
    <main id="main" className="container page-content">
      <section className="panel marketing-unsubscribe">
        <p className="eyebrow">Your inbox, your choice</p>
        <h1>Unsubscribe from marketing.</h1>
        <p>
          Stop Westmere Careers marketing emails to the address that received
          your email, including launch announcements and employer onboarding
          invitations.
        </p>
        <p>
          No sign-in is needed. Essential account emails and saved-search alerts
          you separately requested are unchanged.
        </p>
        {token.success ? (
          <form
            action={`/api/marketing/unsubscribe?token=${token.data}`}
            method="post"
          >
            <button className="button primary" type="submit">
              Unsubscribe from marketing
            </button>
          </form>
        ) : (
          <p className="notice" role="alert">
            Open the unsubscribe button in your original email to update your
            preference.
          </p>
        )}
        <p>
          <Link className="text-link" href="/account?tab=settings#marketing">
            Manage your account settings →
          </Link>
        </p>
      </section>
    </main>
  );
}
