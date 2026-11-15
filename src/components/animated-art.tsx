"use client";
import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
/** CSS-only decorative motion; the user's pause preference persists across pages. */
export function AnimatedArt({
  variant = "opportunity",
}: {
  variant?: "opportunity" | "premium";
}) {
  const [paused, setPaused] = useState(true);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      setReduced(media.matches);
      try {
        setPaused(
          media.matches || localStorage.getItem("westmere-motion") === "paused",
        );
      } catch {
        setPaused(media.matches);
      }
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  function toggle() {
    const next = !paused;
    setPaused(next);
    try {
      localStorage.setItem("westmere-motion", next ? "paused" : "playing");
    } catch {}
  }
  const premium = variant === "premium";
  return (
    <div
      className={`animated-art ${premium ? "premium-art" : "opportunity-art"} ${paused ? "motion-paused" : ""}`}
    >
      <div className="art-glow" aria-hidden="true" />
      <img
        className="floating-art"
        src={`/illustrations/${premium ? "premium-career-studio" : "opportunity-orbit"}.svg`}
        width={premium ? 640 : 720}
        height={premium ? 520 : 540}
        alt={
          premium
            ? "A purple ribbon circles a globe beside a growing plant and a thoughtful application"
            : "A hopeful doorway and winding career path surround a sage globe"
        }
        fetchPriority={premium ? "auto" : "high"}
      />
      <span className="orbit-dot dot-one" aria-hidden="true" />
      <span className="orbit-dot dot-two" aria-hidden="true" />
      <span className="orbit-star" aria-hidden="true">
        ✦
      </span>
      <span className="floating-label">
        {premium
          ? "Your experience, in a new light."
          : "A world of possibility."}
      </span>
      <button
        className="motion-control"
        type="button"
        onClick={toggle}
        disabled={reduced}
        aria-pressed={paused}
      >
        {paused ? <Play size={15} /> : <Pause size={15} />}{" "}
        {reduced
          ? "Reduced motion enabled"
          : paused
            ? "Play gentle animation"
            : "Pause animation"}
      </button>
    </div>
  );
}
