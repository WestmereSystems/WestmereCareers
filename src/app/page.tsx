import { AustraliaIcon } from "@/components/australia-icon";
import { Suspense } from "react";
import { AnimatedArt } from "@/components/animated-art";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Leaf,
  ShieldCheck,
  MessageCircle,
  MoveUpRight,
  Sparkles,
  Heart,
  Compass,
} from "lucide-react";
import { SearchBar } from "@/components/search-bar";
import { JobCard } from "@/components/job-card";
import { getPublicJobs } from "@/lib/jobs-server";

export default function Home() {
  return (
    <main id="main">
      <section className="hero">
        <div className="container">
          <div className="hero-grid">
            <div className="hero-copy">
              <div className="eyebrow">
                <span className="small-sun" />A little clarity. A world of
                possibility.
              </div>
              <h1>
                Your career
                <br />
                starts with{" "}
                <span>
                  Westmere<span className="heading-dot">.</span>
                </span>
              </h1>
              <p>
                Good work is out there. Find your next chapter with clear pay,
                honest insights, and a little more confidence.
              </p>
              <div className="hero-reassurance">
                <span>
                  <Check size={15} />
                  Free to find your next role
                </span>
                <span>
                  <AustraliaIcon />
                  Made for Australia
                </span>
              </div>
            </div>
            <div className="hero-art">
              <AnimatedArt />
            </div>
          </div>
          <SearchBar />
          <div className="popular-searches">
            <span>Somewhere to start</span>
            {[
              "Design",
              "Technology",
              "Customer success",
              "Healthcare",
              "All opportunities",
            ].map((x, i) => (
              <Link
                key={x}
                href={i === 4 ? "/jobs" : `/jobs?q=${encodeURIComponent(x)}`}
              >
                {x}
                <ArrowUpRight size={12} />
              </Link>
            ))}
          </div>
        </div>
      </section>
      <section className="container human-story">
        <figure className="people-photo">
          <img
            src="/images/creative-colleagues.webp"
            alt="Creative colleagues working together"
            width="1260"
            height="709"
            loading="lazy"
          />
        </figure>
        <div>
          <p className="eyebrow">Behind every application is a person</p>
          <h2>Your next chapter deserves a human touch.</h2>
          <p>
            Clearer opportunities. More useful updates. A place to bring your
            experience and find a little more possibility.
          </p>
          <Link href="/about" className="text-link">
            Why Westmere exists <ArrowRight size={17} />
          </Link>
        </div>
      </section>
      <section className="trust-strip">
        <div className="container">
          <p>
            A job search that gives you
            <br />
            <strong>a clearer picture.</strong>
          </p>
          <span>
            <ShieldCheck size={22} />
            Your information, your choice
          </span>
          <span>
            <MessageCircle size={22} />
            Employer response insights
          </span>
          <span>
            <Heart size={22} />A human approach to hiring
          </span>
        </div>
      </section>
      <section className="section opportunities container">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Possibility, meet opportunity</p>
            <h2>A fresh start could be right here.</h2>
            <p className="muted">
              A few roles to help you picture your next move.
            </p>
          </div>
          <Link className="text-link" href="/jobs">
            Explore all roles
            <ArrowRight size={18} />
          </Link>
        </div>
        <Suspense
          fallback={
            <p className="notice" role="status">
              Finding a few possibilities…
            </p>
          }
        >
          <FreshRoles />
        </Suspense>
      </section>
      <section className="clarity-section">
        <div className="container clarity-grid">
          <div className="clarity-art">
            <div className="timeline-preview">
              <div className="timeline-title">
                <span className="company-monogram tone-0">f</span>
                <div>
                  <strong>Senior Product Designer</strong>
                  <small>Example application</small>
                </div>
                <span className="live-dot" />
              </div>
              <div className="timeline-item complete">
                <span />
                <div>
                  <strong>Application received</strong>
                  <p>You’re on your way.</p>
                </div>
                <Check size={16} />
              </div>
              <div className="timeline-item complete">
                <span />
                <div>
                  <strong>Opened by the hiring team</strong>
                  <p>A clear, timestamped update.</p>
                </div>
                <Check size={16} />
              </div>
              <div className="timeline-item">
                <span />
                <div>
                  <strong>Awaiting their next update</strong>
                  <p>Know what’s happened. Skip the guesswork.</p>
                </div>
              </div>
              <div className="timeline-caption">
                <MessageCircle size={15} />
                Application activity stays free.
              </div>
            </div>
            <span className="hand-note">
              Less wondering.
              <br />
              More moving forward.
            </span>
          </div>
          <div className="clarity-copy">
            <p className="eyebrow">Clarity is a kind of kindness</p>
            <h2>
              You deserve to know
              <br />
              where you stand.
            </h2>
            <p className="muted">
              Applying takes effort. We think you should have a clearer picture
              of what happens next.
            </p>
            <ul className="check-list">
              <li>
                <Check />
                See when an internal application is opened.
              </li>
              <li>
                <Check />
                Explore candidate-reported employer response times.
              </li>
              <li>
                <Check />
                Understand what we can—and can’t—track.
              </li>
            </ul>
            <Link className="text-link" href="/transparency">
              Our transparency promise
              <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>
      <section className="section container">
        <div className="plus-banner">
          <div>
            <span className="plus-wordmark">
              <Sparkles size={17} />
              Careers<span>+</span>
            </span>
            <h2>
              Your experience.
              <br />A little more possibility.
            </h2>
            <p>
              Turn what you’ve done into a thoughtful application.
              <br />
              Get personal CV guidance and tailor your next application.
            </p>
            <Link className="button purple" href="/careers-plus">
              Meet your application studio
              <ArrowRight size={17} />
            </Link>
            <small>
              A$25 / month · Cancel online · Core job search stays free
            </small>
          </div>
          <div className="studio-preview">
            <div>
              <span className="studio-dot" />
              <small>APPLICATION STUDIO</small>
              <Sparkles size={16} />
            </div>
            <p>
              Make your strengths
              <br />
              <strong>easier to see.</strong>
            </p>
            <div className="preview-line long" />
            <div className="preview-line" />
            <div className="preview-line medium" />
            <span className="studio-suggestion">
              <Check size={15} />
              Your experience, clearly expressed.
            </span>
            <div className="preview-line medium" />
            <div className="preview-line short" />
          </div>
        </div>
      </section>
      <section className="employer-invitation container">
        <div>
          <p className="eyebrow">Good teams start with good people</p>
          <h2>Hiring for your next chapter?</h2>
          <p className="muted">
            Make a great first impression. Bring your opportunity to Westmere.
          </p>
        </div>
        <Link className="button secondary" href="/employers">
          Let’s find your people
          <ArrowUpRight size={17} />
        </Link>
      </section>
    </main>
  );
}

async function FreshRoles() {
  const { jobs, source, error } = await getPublicJobs({ pageSize: 3 });
  return (
    <>
      {source === "demo" && (
        <p className="demo-note">
          <span />
          Development preview · Fictional employers and sample roles.
        </p>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {!error && !jobs.length && (
        <p className="notice">
          New opportunities will appear here after employer and listing review.
          Explore employers or save a search for your next chapter.
        </p>
      )}
      <div className="job-grid">
        {jobs.map((job) => (
          <JobCard key={job.id} job={job} />
        ))}
      </div>
    </>
  );
}
