import { publicPageMetadata } from "@/lib/search-metadata";
import Link from "next/link";
import { ArrowRight, Heart, ShieldCheck, MessagesSquare } from "lucide-react";
export const metadata = publicPageMetadata(
  "/about",
  "About Westmere Careers",
  "Why Westmere Careers is building a more human Australian careers marketplace, with clearer information for job seekers, employers and recruitment agencies.",
);
export default function About() {
  return (
    <main id="main">
      <section className="container about-hero">
        <div>
          <p className="eyebrow">A little clarity. A world of possibility.</p>
          <h1>Finding work should leave you with hope.</h1>
          <p className="lead">
            Westmere Careers exists to help people find their next step in the
            Australian working world, with clearer information, useful tools and
            a little more humanity.
          </p>
          <p>
            Looking for work can be exhausting, especially in a tough job
            market. Applications take time and care. Long silences, unclear pay
            and an endless stream of listings can make the process feel
            impersonal. We believe the people behind those applications deserve
            better.
          </p>
          <Link href="/jobs" className="button primary">
            Find your next chapter <ArrowRight size={18} />
          </Link>
        </div>
        <figure className="people-photo">
          <img
            src="/images/healthcare-team.webp"
            alt="Two healthcare workers in blue scrubs and masks working together"
            width="1920"
            height="1280"
          />
          <figcaption>Every next step begins with a person.</figcaption>
        </figure>
      </section>
      <section className="container section">
        <p className="eyebrow">What we are here to do</p>
        <h2>Make the next step feel possible.</h2>
        <div className="mission-grid">
          <article className="panel">
            <Heart size={26} />
            <h3>Help people see their strengths.</h3>
            <p>
              Your experience has value. Search tools and optional Careers+
              guidance help you find relevant opportunities and express what you
              can bring, while keeping you in control of your applications.
            </p>
          </article>
          <article className="panel">
            <MessagesSquare size={26} />
            <h3>Bring a little clarity to hiring.</h3>
            <p>
              For applications made on Westmere, receipts, recorded first views
              and employer updates make progress easier to follow.
              Candidate-reported response insights add context when there is
              enough recent evidence.
            </p>
          </article>
          <article className="panel">
            <ShieldCheck size={26} />
            <h3>Build trust through useful detail.</h3>
            <p>
              Clear pay, business verification, reviewed listings and private
              candidate profiles give both sides a stronger starting point.
              These checks support informed choices; they do not guarantee a
              hiring outcome.
            </p>
          </article>
        </div>
      </section>
      <section className="container about-note panel">
        <div>
          <p className="eyebrow">For the people on both sides</p>
          <h2>Better opportunities. More thoughtful conversations.</h2>
          <p>
            Employers and agencies are people too. We are building a hiring
            workspace that helps teams write clear roles, consider applications
            and keep candidates informed without unnecessary noise.
          </p>
          <p>
            Westmere is an independent Australian service operated by Westmere
            Systems. Our aim is practical: help people find work and help good
            employers find people, with an experience that feels considered,
            optimistic and easy to use.
          </p>
          <p>
            <strong>Your career starts with Westmere.</strong>
          </p>
          <div className="actions-row">
            <Link className="button secondary" href="/employers">
              Meet your hiring workspace <ArrowRight size={17} />
            </Link>
            <Link className="text-link" href="/transparency">
              Our transparency promise →
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
