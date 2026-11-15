const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export const emailLogo =
  "https://westmere-careers.vercel.app/brand/westmere-email-logo.png";
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
    `Notifications: ${origin.origin}/notifications`,
    `Email preferences: ${origin.origin}/account`,
    `Privacy: ${origin.origin}/privacy`,
    "Help: support@westmere.com.au",
    "Your career starts with Westmere.",
  ].join("\n\n");
  const html = `<!doctype html><html lang="en-AU"><body style="margin:0;background:#f6f6ee;color:#213e34;font:17px/1.65 Arial,sans-serif"><main style="max-width:600px;margin:24px auto;padding:32px;background:#fffef8;border:1px solid #dce2d3;border-radius:18px"><a href="${origin.origin}"><img src="${emailLogo}" width="260" height="62" alt="Westmere Careers" style="max-width:100%;height:auto"/></a><p style="color:#705291">Your career starts with Westmere.</p><h1 style="font-size:28px;line-height:1.25">${escape(snapshot.title)}</h1><p>${escape(snapshot.message)}</p><p><a href="${url}" style="display:inline-block;background:#244d3e;color:#fffef8;padding:12px 20px;border-radius:9px">View your account →</a></p><p style="font-size:14px">This is a service update for your Westmere account. No CV or private application content is included.</p><p style="font-size:15px"><a href="${origin.origin}/notifications">Notifications</a> · <a href="${origin.origin}/account">Email preferences</a> · <a href="${origin.origin}/privacy">Privacy</a> · <a href="mailto:support@westmere.com.au">Help</a></p></main></body></html>`;
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
