import { Check } from "lucide-react";
import { AustraliaIcon } from "./australia-icon";

/** Both homepages use the same grid, typography, photograph and dotted surface. */
export function HomeHero({
  image = "/images/laptop-work.webp",
  imageAlt = "A man working on a laptop beside a bright window",
  children,
}: {
  image?: string;
  imageAlt?: string;
  children: React.ReactNode;
}) {
  return (
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
          <figure className="hero-photograph">
            <img
              src={image}
              alt={imageAlt}
              width="1920"
              height="1280"
              fetchPriority="high"
            />
            <figcaption>
              Good work is out there.
              <small>Your career starts with Westmere.</small>
            </figcaption>
          </figure>
        </div>
        {children}
      </div>
    </section>
  );
}
