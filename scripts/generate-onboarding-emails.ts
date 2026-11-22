import { readFile, mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { renderMarketingEmail } from "../supabase/functions/_shared/marketing-email.ts";
import { emailLogo } from "../supabase/functions/_shared/account-email.ts";

// Input is a private JSON object mapping recipient email to the live unsubscribe path.
// This creates reviewable files only; it never queues or sends an email.
const contactsFile = process.argv[2];
if (!contactsFile)
  throw Error(
    "Supply a private JSON file containing live recipient unsubscribe paths.",
  );
const contacts = JSON.parse(await readFile(contactsFile, "utf8")) as Record<
  string,
  string
>;
const directory = resolve("deliverables/employer-invitations-20261122");
const previewLogo = `data:image/png;base64,${(await readFile("public/brand/westmere-email-logo.png")).toString("base64")}`;
const invitations = [
  {
    slug: "y-victoria",
    company: "Y Victoria",
    recipient: "procurementenq.vic@ymca.org.au",
    source: "https://victoria.ymca.org.au/suppliers",
    subject: "Supplier introduction: Y Victoria × Westmere Careers",
    greeting: "Hi Y Victoria procurement team,",
    paragraphs: [
      "I’m Louis from Westmere Careers. Your supplier page invites introductions from prospective partners, so I wanted to introduce our Australian careers platform and invite Y Victoria to explore employer onboarding.",
      "Behind Y Victoria’s recreation, children’s and youth services are the people who keep each service running. Westmere’s initial focus includes administration, reception, customer service, accounts support and project coordination, which may be relevant to your support teams.",
      "During our founding phase, your team can register for free, complete business verification and prepare an employer profile and vacancies privately. Registration needs no card or paid subscription. Profiles and vacancies remain private during this phase, with your publication permission required for release.",
      "If this fits Y Victoria’s recruitment approach, the link below explains the next steps. Would you be open to sharing it with the team that evaluates recruitment platforms? I’m happy to answer any supplier assessment questions first.",
    ],
  },
  {
    slug: "ausgrid",
    company: "Ausgrid",
    recipient: "purchasing@ausgrid.com.au",
    source:
      "https://www.ausgrid.com.au/industry-partners/procurement-and-suppliers",
    subject: "Supplier introduction: Westmere Careers for Ausgrid",
    greeting: "Hi Ausgrid purchasing team,",
    paragraphs: [
      "I’m Louis from Westmere Careers. I’m contacting you through the prospective supplier route on Ausgrid’s website to introduce our Australian careers platform and invite your team to assess employer onboarding.",
      "Supporting an electricity network also takes strong customer service, administration and project coordination. Those office and support roles are part of Westmere’s initial focus, alongside accounts support and executive assistance.",
      "Your team can register for free, complete business verification and prepare an employer profile and vacancies privately during our founding phase. No card or paid subscription is required to register. Profiles and vacancies remain private during this phase, with your publication permission required for release.",
      "If Westmere could complement Ausgrid’s recruitment channels, would you be open to passing this introduction to the relevant recruitment or supplier assessment team? The link below provides a starting point, and I’m happy to supply any further information your procurement process requires.",
    ],
  },
  {
    slug: "wiley",
    company: "Wiley",
    recipient: "tenders@wiley.com.au",
    source: "https://wiley.com.au/supply-chain/",
    subject: "Supplier expression of interest: Westmere Careers for Wiley",
    greeting: "Hi Wiley supply chain team,",
    paragraphs: [
      "I’m Louis from Westmere Careers. Your supply chain page invites potential suppliers to introduce their services, so I’m sharing our Australian careers platform for consideration and inviting Wiley to explore employer onboarding.",
      "Wiley’s engineering and construction projects depend on the people who coordinate work behind the scenes. Westmere’s initial focus includes project coordination, administration, accounts support and executive assistance, which may be relevant to those teams.",
      "During our founding phase, Wiley can register for free, complete business verification and prepare an employer profile and vacancies privately. No card or paid subscription is needed to register. Profiles and vacancies remain private during this phase, with your publication permission required for release.",
      "If this could support Wiley’s hiring, would you be open to sharing the link below with the team that assesses recruitment platforms? This is a general supplier introduction, and I’m happy to work through your evaluation or pre-qualification process if there is a fit.",
    ],
  },
];
await mkdir(directory, { recursive: true });
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
for (const invitation of invitations) {
  if (!contacts[invitation.recipient])
    throw Error(`Missing unsubscribe path for ${invitation.company}`);
  const message = renderMarketingEmail(randomUUID(), invitation.recipient, {
    ...invitation,
    purpose: "supplier_introduction",
    siteOrigin: "https://westmere.com.au",
    unsubscribeUrl: new URL(
      contacts[invitation.recipient],
      "https://westmere.com.au",
    ).href,
  });
  await writeFile(resolve(directory, `${invitation.slug}.html`), message.html.replace(emailLogo, previewLogo));
  await writeFile(
    resolve(directory, `${invitation.slug}.txt`),
    `To: ${invitation.recipient}\nSubject: ${message.subject}\nFrom: ${message.from}\nReply-To: ${message.reply_to}\n\n${message.text}\n`,
  );
  // An optional provider request retains the plain-text part and one-click headers.
  await writeFile(
    resolve(directory, `${invitation.slug}.email.json`),
    JSON.stringify(message, null, 2) + "\n",
  );
}
const index = `<!doctype html><html lang="en-AU"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Employer invitations | Westmere Careers</title><style>
*{box-sizing:border-box}body{margin:0;background:#eff2e9;color:#19382d;font:16px/1.6 system-ui,sans-serif}main{max-width:1100px;margin:auto;padding:64px 28px}header{max-width:740px;margin-bottom:38px}.eyebrow{font-size:12px;letter-spacing:2px;font-weight:750}h1{font-size:clamp(32px,5vw,52px);line-height:1.12;letter-spacing:-1.5px;margin:16px 0 22px}p{color:#53685b}section{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}article{background:white;border:1px solid #cfdbca;border-radius:18px;padding:26px;display:flex;flex-direction:column}h2{margin:0 0 12px;font-size:25px}address{font:12px/1.5 ui-monospace,monospace;overflow-wrap:anywhere;color:#59705f}.subject{font-weight:650;color:#19382d;min-height:78px}.button{display:block;background:#173a2a;color:white;text-decoration:none;border-radius:7px;text-align:center;padding:13px 15px;font-weight:650;margin-top:auto}.links{font-size:13px;margin:16px 0 0}a{color:#244f36}.note{margin-top:32px;max-width:820px;font-size:14px}footer{border-top:1px solid #cfdbca;padding-top:24px;margin-top:32px;font-size:12px;color:#59705f}a:focus-visible{outline:3px solid #7ca25e;outline-offset:4px}@media(max-width:800px){section{grid-template-columns:1fr}.subject{min-height:0}main{padding:36px 20px}}</style></head><body><main>
<header><div class="eyebrow">WESTMERE CAREERS · EMAIL DRAFTS</div><h1>Three introductions.<br>A clear next step.</h1><p>Personalised supplier introductions inviting Y Victoria, Ausgrid and Wiley to explore employer onboarding. Signed simply Louis. Prepared 22 November 2026.</p></header>
<section>${invitations.map((invitation) => `<article><h2>${escape(invitation.company)}</h2><address>${escape(invitation.recipient)}</address><p class="subject">${escape(invitation.subject)}</p><a class="button" href="${invitation.slug}.html">Open email preview →</a><p class="links"><a href="${invitation.slug}.txt">Plain text</a> · <a href="${invitation.source}" target="_blank" rel="noreferrer">Official supplier invitation</a></p></article>`).join("")}</section>
<p class="note"><strong>Drafts only — no emails sent.</strong> Each bottom unsubscribe button contains the intended recipient’s live removal link. Opening that link is safe; confirming the unsubscribe will suppress that address. Keep these files private and do not use those confirmation buttons for testing.</p>
<p class="note">The published supplier invitations support a relevant supplier introduction to these addresses. They do not authorise adding the recipients to an ongoing newsletter. Recheck the source and the unsubscribe register immediately before sending. For programmatic delivery, the accompanying .email.json files include the plain-text alternative and List-Unsubscribe headers.</p>
<footer>Westmere Careers · <a href="https://westmere.com.au">westmere.com.au</a><br>Operated by Westmere Systems · ABN 16 319 214 903</footer></main></body></html>`;
await writeFile(resolve(directory, "index.html"), index);
console.log(
  `Created three HTML previews, plain-text alternatives, provider payloads and index in ${directory}. No email queued or sent.`,
);
