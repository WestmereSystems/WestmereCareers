export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const alertEvents = new Set([
  "email.sent",
  "email.delivered",
  "email.delivery_delayed",
  "email.failed",
  "email.bounced",
  "email.complained",
  "email.suppressed",
]);
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
type Snapshot = {
  searchName: string;
  siteOrigin: string;
  unsubscribeUrl: string;
  jobs: { id: string; title: string; company: string; location: string }[];
};
export function renderAlert(
  id: string,
  recipient: string,
  kind: string,
  snapshot: Snapshot,
) {
  if (
    !uuidPattern.test(id) ||
    !snapshot ||
    typeof snapshot.searchName !== "string" ||
    snapshot.searchName.length > 100 ||
    !Array.isArray(snapshot.jobs) ||
    snapshot.jobs.length > 8
  )
    throw new Error("INVALID_SNAPSHOT");
  const origin = new URL(snapshot.siteOrigin),
    unsubscribe = new URL(snapshot.unsubscribeUrl);
  if (
    origin.protocol !== "https:" ||
    origin.origin !== snapshot.siteOrigin ||
    unsubscribe.origin !== "https://ldmwqupidlgrkkjjpcvn.supabase.co" ||
    unsubscribe.pathname !== "/functions/v1/westmere-alerts/unsubscribe" ||
    !uuidPattern.test(unsubscribe.searchParams.get("token") || "")
  )
    throw new Error("INVALID_DESTINATION");
  const title = snapshot.searchName.replace(/[\r\n\u0000-\u001f]/g, " ");
  const preview = kind === "preview";
  const subject = preview
    ? `Your Westmere job-alert preview — ${title}`
    : `New possibilities for ${title} — Westmere Careers`;
  const intro = preview
    ? "Your job alerts are ready for a little possibility. When new approved roles match your saved search, you’ll hear from us at your chosen frequency."
    : "A few new opportunities match the search you saved. Take your time, explore the details, and see what feels right for you.";
  const rows = snapshot.jobs.map((j) => {
    if (
      !uuidPattern.test(j.id) ||
      ![j.title, j.company, j.location].every(
        (v) => typeof v === "string" && v.length <= 300,
      )
    )
      throw new Error("INVALID_JOB");
    return { ...j, url: `${origin.origin}/jobs/${j.id}` };
  });
  const text = [
    "Your career starts with Westmere.",
    title,
    intro,
    ...rows.map((j) => `${j.title}\n${j.company} · ${j.location}\n${j.url}`),
    `Manage your saved searches: ${origin.origin}/saved-searches`,
    `Unsubscribe from this search: ${unsubscribe.href}`,
    "You chose job alerts for this saved search. No CV or application information is included.",
  ].join("\n\n");
  const html = `<!doctype html><html lang="en-AU"><body style="margin:0;background:#f6f6ee;color:#213e34;font:17px/1.65 Arial,sans-serif"><main style="max-width:600px;margin:24px auto;padding:32px;background:#fffef8;border:1px solid #dce2d3;border-radius:18px"><p style="color:#27654f;font-weight:bold">westmere careers</p><p style="color:#705291">Your career starts with Westmere.</p><h1 style="font-size:28px;line-height:1.25">${escape(title)}</h1><p>${escape(intro)}</p>${rows.map((j) => `<article style="padding:20px 0;border-top:1px solid #dce2d3"><h2 style="font-size:21px;margin:0"><a style="color:#27654f" href="${j.url}">${escape(j.title)}</a></h2><p>${escape(j.company)} · ${escape(j.location)}</p><a style="color:#27654f" href="${j.url}">Explore this role →</a></article>`).join("")}<p><a style="color:#27654f" href="${origin.origin}/saved-searches">Manage your saved searches</a></p><p style="font-size:14px">You chose job alerts for this saved search. No CV or application information is included.</p><p style="font-size:15px"><a style="color:#705291" href="${escape(unsubscribe.href)}">Unsubscribe from this search</a></p></main></body></html>`;
  return {
    from: "Westmere Careers <hello@westmere.com.au>",
    to: [recipient],
    subject,
    html,
    text,
    headers: {
      "List-Unsubscribe": `<${unsubscribe.href}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    tags: [
      { name: "category", value: "westmere_job_alert" },
      { name: "outbox_id", value: id },
    ],
  };
}
function base64(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
export async function verifySvix(
  raw: Uint8Array,
  headers: Headers,
  secret: string,
  now = Date.now(),
) {
  const id = headers.get("svix-id"),
    timestamp = headers.get("svix-timestamp"),
    signatures = headers.get("svix-signature");
  if (
    !id ||
    id.length > 200 ||
    !timestamp ||
    !/^\d{1,12}$/.test(timestamp) ||
    !signatures ||
    signatures.length > 4096 ||
    !secret.startsWith("whsec_") ||
    secret.length > 512 ||
    Math.abs(now / 1000 - Number(timestamp)) > 300
  )
    return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      base64(secret.slice(6)),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const prefix = new TextEncoder().encode(`${id}.${timestamp}.`),
      signed = new Uint8Array(prefix.length + raw.length);
    signed.set(prefix);
    signed.set(raw, prefix.length);
    for (const candidate of signatures.split(" ").slice(0, 20)) {
      const [version, sig] = candidate.split(",");
      if (
        version === "v1" &&
        sig &&
        (await crypto.subtle.verify("HMAC", key, base64(sig), signed))
      )
        return true;
    }
  } catch {
    return false;
  }
  return false;
}
export async function sameSecret(a: string, b: string) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const u = new Uint8Array(x),
    v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}
export function retrySeconds(
  header: string | null,
  attempt: number,
  now = Date.now(),
) {
  const numeric = Number(header);
  const seconds =
    header && Number.isFinite(numeric)
      ? numeric
      : header
        ? (Date.parse(header) - now) / 1000
        : 0;
  return Math.min(
    3600,
    Math.max(
      60,
      Number.isFinite(seconds) ? seconds : 0,
      30 * 2 ** Math.min(attempt, 7),
    ),
  );
}
