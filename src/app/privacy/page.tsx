import Link from "next/link";
import { Fragment } from "react";
import policy from "@/content/privacy-policy.json";
export const metadata = {
  title: "Privacy policy",
  description:
    "How Westmere Careers handles accounts, CVs, applications, employer information and optional career tools.",
};
function linked(text: string) {
  return text.split(/(\[[^\]]+\]\(https:\/\/[^\s)]+\))/g).map((s, i) => {
    const match = s.match(/^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/);
    return match ? (
      <a href={match[2]} key={i} rel="noopener noreferrer">
        {match[1]}
      </a>
    ) : (
      <Fragment key={i}>{s}</Fragment>
    );
  });
}
export default function Privacy() {
  return (
    <main id="main" className="container legal">
      <div className="page-intro">
        <p className="eyebrow">Your information, your choice</p>
        <h1>Westmere Careers Privacy Policy</h1>
        <p className="muted">Last updated: 15 November 2026</p>
      </div>
      <div className="notice">
        <strong>Your CV stays private.</strong> Saving a CV does not publish it
        or send it to OpenAI. Applications share a separate copy with the hiring
        organisation you choose. Optional AI assistance requires a separate
        request and consent.
      </div>
      <nav className="policy-contents" aria-label="Privacy policy contents">
        <h2>Find what you need</h2>
        <ol>
          {policy.map((s, i) => (
            <li key={s.title}>
              <a href={`#privacy-${i + 1}`}>{s.title.replace(/^\d+\. /, "")}</a>
            </li>
          ))}
        </ol>
      </nav>
      {policy.map((s, i) => (
        <section key={s.title} id={`privacy-${i + 1}`}>
          <h2>{s.title}</h2>
          {s.paragraphs.map((p, n) =>
            p.startsWith("- ") ? (
              <ul key={n}>
                {p.split("\n").map((line, k) => (
                  <li key={k}>{linked(line.replace(/^- /, ""))}</li>
                ))}
              </ul>
            ) : (
              <p key={n}>{linked(p)}</p>
            ),
          )}
        </section>
      ))}
      <p>
        <Link href="/account">Manage your private profile</Link> ·{" "}
        <a href="mailto:support@westmere.com.au">Contact our Privacy Officer</a>
      </p>
    </main>
  );
}
