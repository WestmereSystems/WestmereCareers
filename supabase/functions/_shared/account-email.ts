const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export const emailLogo =
  "https://westmere-careers.vercel.app/brand/westmere-email-logo.png?v=2";
export function renderAccountEmail(
  id: string,
  recipient: string,
  snapshot: {
    title: string;
    message: string;
    siteOrigin: string;
    path: string;
  },
) {
  if (
    !/^[a-f0-9-]{36}$/i.test(id) ||
    !snapshot ||
    ![
      "/account",
      "/account?tab=dashboard",
      "/account?tab=verification",
      "/applications",
      "/employers/dashboard",
      "/employers/sample",
    ].includes(snapshot.path) ||
    typeof snapshot.title !== "string" ||
    snapshot.title.length > 200 ||
    typeof snapshot.message !== "string" ||
    snapshot.message.length > 2000
  )
    throw new Error("INVALID_SNAPSHOT");
  const origin = new URL(snapshot.siteOrigin);
  if (origin.protocol !== "https:" || origin.origin !== snapshot.siteOrigin)
    throw new Error("INVALID_DESTINATION");
  const url = origin.origin + snapshot.path;
  const text = [
    snapshot.title,
    snapshot.message,
    `View your account: ${url}`,
    `Notifications: ${origin.origin}/account?tab=notifications`,
    `Email preferences: ${origin.origin}/account`,
    `Privacy: ${origin.origin}/privacy`,
    "Help: hello@westmere.com.au",
    "Your career starts with Westmere.",
  ].join("\n\n");
  const html = `<!doctype html><html lang="en-AU"><body style="margin:0;background:#0b1210;color:#f3f5ee;font:17px/1.65 Arial,sans-serif"><main style="max-width:600px;margin:24px auto;padding:32px;background:#14201b;border:1px solid #34483c;border-radius:18px"><a style="color:#c6e5ab" href="${origin.origin}"><img src="${emailLogo}" width="260" height="62" alt="Westmere Careers" style="max-width:100%;height:auto"/></a><p style="color:#bfa6f4">Your career starts with Westmere.</p><h1 style="font-size:28px;line-height:1.25">${escape(snapshot.title)}</h1><p>${escape(snapshot.message)}</p><p><a href="${url}" style="display:inline-block;background:#c6e5ab;color:#122018;padding:12px 20px;border-radius:9px">View your account →</a></p><p style="font-size:14px">This is a service update for your Westmere account. No CV or private application content is included.</p><p style="font-size:15px"><a style="color:#c6e5ab" href="${origin.origin}/account?tab=notifications">Notifications</a> · <a style="color:#c6e5ab" href="${origin.origin}/account">Email preferences</a> · <a style="color:#c6e5ab" href="${origin.origin}/privacy">Privacy</a> · <a style="color:#c6e5ab" href="mailto:hello@westmere.com.au">Help</a></p></main></body></html>`;
  return {
    from: "Westmere Careers <hello@westmere.com.au>",
    to: [recipient],
    subject:
      snapshot.title.replace(/[\r\n\u0000-\u001f]/g, " ") +
      " — Westmere Careers",
    html,
    text,
    tags: [
      { name: "category", value: "westmere_account" },
      { name: "outbox_id", value: id },
    ],
  };
}
