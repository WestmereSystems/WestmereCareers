import Link from "next/link";
import { Fragment } from "react";
import terms from "@/content/terms-and-conditions.json";

export const metadata = {
  title: "Terms and conditions",
  description:
    "The terms for Westmere Careers accounts, job listings, applications, employer services, transparency features and optional Careers+ tools.",
};

function linked(text: string) {
  return text
    .split(/(\[[^\]]+\]\((?:https:\/\/|\/|mailto:)[^\s)]+\))/g)
    .map((part, index) => {
      const match = part.match(
        /^\[([^\]]+)\]\(((?:https:\/\/|\/|mailto:)[^\s)]+)\)$/,
      );
      if (!match) return <Fragment key={index}>{part}</Fragment>;
      return match[2].startsWith("/") ? (
        <Link href={match[2]} key={index}>
          {match[1]}
        </Link>
      ) : (
        <a href={match[2]} key={index} rel="noopener noreferrer">
          {match[1]}
        </a>
      );
    });
}

export default function Terms() {
  return (
    <main id="main" className="container legal">
      <div className="page-intro">
        <p className="eyebrow">A clear understanding</p>
        <h1>{terms.title}</h1>
        <p className="muted">
          Last updated: {terms.updated} · Version {terms.version}
        </p>
        <p>{terms.introduction}</p>
      </div>
      <section aria-labelledby="terms-key-points">
        <h2 id="terms-key-points">Key points</h2>
        <ul>
          {terms.highlights.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <p>
          These points help you find the main provisions. Read the relevant
          numbered sections for the full agreement.
        </p>
      </section>
      <nav
        className="policy-contents"
        aria-label="Terms and conditions contents"
      >
        <h2>Find what you need</h2>
        <ol>
          {terms.sections.map((section) => (
            <li key={section.id}>
              <a href={`#terms-${section.id}`}>{section.title}</a>
            </li>
          ))}
        </ol>
      </nav>
      {terms.sections.map((section, sectionIndex) => (
        <section key={section.id} id={`terms-${section.id}`}>
          <h2>
            {sectionIndex + 1}. {section.title}
          </h2>
          {section.clauses.map((clause, clauseIndex) => (
            <p
              key={clauseIndex}
              id={`terms-${sectionIndex + 1}-${clauseIndex + 1}`}
            >
              <strong>
                {sectionIndex + 1}.{clauseIndex + 1}
              </strong>{" "}
              {linked(clause)}
            </p>
          ))}
        </section>
      ))}
      <p>
        <a href="mailto:hello@westmere.com.au">Contact Westmere</a> ·{" "}
        <Link href="/privacy">Privacy Policy</Link> ·{" "}
        <Link href="/transparency">Our transparency promise</Link>
      </p>
    </main>
  );
}
