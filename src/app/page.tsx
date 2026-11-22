import { HomeHero } from "@/components/home-hero";
import { marketplaceOpen } from "@/lib/server/launch";
import { redirect } from "next/navigation";
import { AustraliaIcon } from "@/components/australia-icon";
import { Suspense } from "react";
import { FeaturedRoles } from "@/components/featured-roles";
import { HomeRolesSkeleton } from "@/components/home-skeleton";
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
import { getPublicJobs } from "@/lib/jobs-server";

export default async function Home() {
  if (!(await marketplaceOpen())) redirect("/launch");
  return (
    <main id="main" className="home-page">
      <HomeHero>
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
      </HomeHero>
      <section className="container human-story">
        <figure className="people-photo">
          <img
            src="/images/healthcare-team.webp"
            alt="Two healthcare workers in blue scrubs and masks working together"
            width="1920"
            height="1280"
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
        <Suspense fallback={<HomeRolesSkeleton />}>
          <FreshRoles />
        </Suspense>
      </section>
      <section className="clarity-section">
        <div className="container clarity-grid">
          <div className="clarity-art">
            <div className="timeline-preview">
              <div className="timeline-title">
                <span className="company-monogram tone-0"><Check size={18} /></span>
                <div>
                  <strong>Your application</strong>
                  <small>Keep track of each step</small>
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
      <section
        className="australia-story container"
        aria-labelledby="australia-story-title"
      >
        <div className="australia-story-photo">
          <img
            src="/images/kangaroo-visit.webp"
            alt="A man spending time with kangaroos"
            width="1600"
            height="2131"
            loading="lazy"
          />
        </div>
        <div className="australia-story-copy">
          <span className="australia-story-label">
            <AustraliaIcon />
            Made for the Australian working world.
          </span>
          <h2 id="australia-story-title">
            A world of possibility.
            <br />
            Right here in Australia.
          </h2>
          <p>
            Good work takes all kinds of people, in all kinds of places. Bring
            your experience. Find your next chapter.
          </p>
          <Link className="button primary" href="/jobs">
            Explore opportunities <ArrowRight size={17} />
          </Link>
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
              Meet your Careers+ Studio
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
  const inventory = await getPublicJobs({ pageSize: 12, sort: "newest" });
  return <FeaturedRoles initial={inventory} />;
}
