import { emailLogo } from "./account-email.ts";
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function renderLaunchEmail(
  id: string,
  recipient: string,
  snapshot: {
    title: string;
    message: string;
    siteOrigin: string;
    unsubscribeUrl: string;
  },
) {
  const origin = new URL(snapshot.siteOrigin),
    unsubscribe = new URL(snapshot.unsubscribeUrl);
  if (
    origin.protocol !== "https:" ||
    origin.origin !== snapshot.siteOrigin ||
    unsubscribe.origin !== origin.origin ||
    unsubscribe.pathname !== "/launch/unsubscribe" ||
    !/^[a-f0-9-]{36}$/i.test(unsubscribe.searchParams.get("token") || "")
  )
    throw Error("INVALID_LAUNCH_EMAIL");
  const title = "Westmere Careers is live across Australia";
  const message =
    "Westmere Careers has launched across Australia. Explore opportunities, prepare your next application or open your business workspace. Your private account details remain private. Business profiles and vacancies appear only after their separate publication approvals.";
  return {
    from: "Westmere Careers <hello@westmere.com.au>",
    to: [recipient],
    subject: `${title} — Westmere Careers`,
    text: [
      title,
      message,
      `Explore Westmere Careers: ${origin.origin}`,
      `Remove me from launch emails: ${unsubscribe.href}`,
      `Privacy: ${origin.origin}/privacy`,
      "Help: hello@westmere.com.au",
    ].join("\n\n"),
    html: `<!doctype html><html lang="en-AU"><body style="margin:0;background:#0b1210;color:#f3f5ee;font:17px/1.65 Arial,sans-serif"><main style="max-width:600px;margin:24px auto;padding:32px;background:#14201b;border:1px solid #34483c;border-radius:18px"><a href="${origin.origin}"><img src="${emailLogo}" width="260" height="62" alt="Westmere Careers"/></a><h1>${title}</h1><p>${message}</p><p><a style="color:#c6e5ab" href="${origin.origin}">Explore Westmere Careers →</a></p><p style="font-size:14px">You registered with Westmere Careers or requested an email when we launched. This is a launch announcement.</p><p><a style="color:#c6e5ab" href="${escape(unsubscribe.href)}">Remove me from launch emails</a> · <a style="color:#c6e5ab" href="${origin.origin}/privacy">Privacy</a> · <a style="color:#c6e5ab" href="mailto:hello@westmere.com.au">Help</a></p></main></body></html>`,
    tags: [
      { name: "category", value: "westmere_launch" },
      { name: "outbox_id", value: id },
    ],
  };
}
