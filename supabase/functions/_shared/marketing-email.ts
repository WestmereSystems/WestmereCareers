import { emailLogo } from "./account-email.ts";

export type MarketingEmailSnapshot = {
  company: string;
  subject: string;
  greeting: string;
  paragraphs: string[];
  siteOrigin: string;
  unsubscribeUrl: string;
  purpose: "supplier_introduction" | "marketing";
};
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function renderMarketingEmail(
  id: string,
  recipient: string,
  snapshot: MarketingEmailSnapshot,
) {
  const unsubscribe = new URL(snapshot.unsubscribeUrl);
  if (
    !uuid.test(id) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient) ||
    snapshot.siteOrigin !== "https://westmere.com.au" ||
    unsubscribe.origin !== snapshot.siteOrigin ||
    unsubscribe.pathname !== "/marketing/unsubscribe" ||
    !uuid.test(unsubscribe.searchParams.get("token") || "") ||
    [...unsubscribe.searchParams.keys()].some((key) => key !== "token") ||
    unsubscribe.hash ||
    !snapshot.subject ||
    /[\r\n]/.test(snapshot.subject) ||
    snapshot.subject.length > 180 ||
    !snapshot.greeting ||
    !snapshot.company ||
    !Array.isArray(snapshot.paragraphs) ||
    snapshot.paragraphs.length < 1 ||
    snapshot.paragraphs.length > 8 ||
    snapshot.paragraphs.some(
      (paragraph) => typeof paragraph !== "string" || paragraph.length > 2500,
    )
  )
    throw Error("INVALID_MARKETING_EMAIL");
  if (!["supplier_introduction", "marketing"].includes(snapshot.purpose))
    throw Error("INVALID_MARKETING_PURPOSE");
  const onboarding = `${snapshot.siteOrigin}/launch/employers`;
  const oneClick = `${snapshot.siteOrigin}/api/marketing/unsubscribe?token=${unsubscribe.searchParams.get("token")}`;
  const html = `<!doctype html>
<html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${escape(snapshot.subject)}</title></head>
<body style="margin:0;padding:0;background:#f1f2ec;color:#233d32;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">An invitation for ${escape(snapshot.company)} to explore employer onboarding with Westmere Careers.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f1f2ec"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #d7dfd4;border-radius:16px;overflow:hidden">
<tr><td style="background:#112b22;padding:28px 32px"><a href="${snapshot.siteOrigin}" style="text-decoration:none;color:#f3f5ee"><img src="${emailLogo}" width="240" height="57" alt="Westmere Careers" style="display:block;width:240px;max-width:100%;height:auto;border:0;color:#f3f5ee;font-size:22px;font-weight:bold"></a></td></tr>
<tr><td style="padding:32px 32px 24px;font-size:16px;line-height:1.7">
<p style="margin:0 0 22px;color:#617267;font-size:12px;letter-spacing:1.6px;font-weight:bold">AN INVITATION FOR ${escape(snapshot.company.toUpperCase())}</p>
<p style="margin:0 0 20px">${escape(snapshot.greeting)}</p>
${snapshot.paragraphs.map((paragraph) => `<p style="margin:0 0 18px">${escape(paragraph)}</p>`).join("\n")}
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:26px 0"><tr><td bgcolor="#c7e6ad" style="border-radius:7px"><a href="${onboarding}" style="display:inline-block;padding:14px 22px;color:#173424;text-decoration:none;font-weight:bold;font-size:15px;border:1px solid #c7e6ad;border-radius:7px">Explore employer onboarding &#8594;</a></td></tr></table>
<p style="margin:24px 0 0">Louis</p>
<p style="margin:2px 0 0;font-size:14px;color:#617267">Westmere Careers<br><a href="${snapshot.siteOrigin}" style="color:#234f3a">westmere.com.au</a></p>
</td></tr>
<tr><td style="padding:22px 32px 28px;background:#f8f9f5;border-top:1px solid #e1e6dd;color:#647468;font-size:12px;line-height:1.7">
<p style="margin:0 0 14px">Westmere Careers is operated by Westmere Systems.<br>ABN 16 319 214 903 &middot; <a href="mailto:hello@westmere.com.au" style="color:#4b6252">hello@westmere.com.au</a></p>
<p style="margin:0 0 15px">You can stop Westmere marketing emails at any time. No account or reply is needed.</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td style="border:1px solid #879b88;border-radius:6px"><a href="${escape(unsubscribe.href)}" style="display:inline-block;padding:11px 17px;color:#294c36;text-decoration:none;font-size:13px;font-weight:bold;border-radius:6px">Unsubscribe from marketing</a></td></tr></table>
</td></tr></table>
</td></tr></table></body></html>`;
  return {
    from: "Westmere Careers <hello@westmere.com.au>",
    to: [recipient],
    reply_to: "hello@westmere.com.au",
    subject: snapshot.subject,
    text: [
      snapshot.greeting,
      ...snapshot.paragraphs,
      `Explore employer onboarding: ${onboarding}`,
      "Louis",
      "Westmere Careers",
      snapshot.siteOrigin,
      "Westmere Systems · ABN 16 319 214 903",
      "hello@westmere.com.au",
      `Unsubscribe from marketing (no account or reply needed): ${unsubscribe.href}`,
    ].join("\n\n"),
    html,
    headers: {
      "List-Unsubscribe": `<${oneClick}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    tags: [
      { name: "category", value: "westmere_marketing" },
      { name: "outbox_id", value: id },
    ],
  };
}
