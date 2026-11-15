"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Pause, Play, RefreshCw } from "lucide-react";
import type { PublicJobsResult } from "@/lib/jobs-server";
import { JobCard } from "./job-card";

/** The same reviewed, published inventory as search; never substitutes demo jobs for live errors. */
export function FeaturedRoles({ initial }: { initial: PublicJobsResult }) {
  const [inventory, setInventory] = useState(initial);
  const [index, setIndex] = useState(0);
  const [columns, setColumns] = useState(3);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [inView, setInView] = useState(false);
  const [error, setError] = useState(initial.error || "");
  const [announcement, setAnnouncement] = useState("");
  const viewport = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const maxIndex = Math.max(0, inventory.jobs.length - columns);
  const refresh = useCallback(async () => {
    if (busy.current || document.visibilityState === "hidden") return;
    busy.current = true;
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch("/api/jobs?sort=newest", {
        cache: "no-store",
        signal: controller.signal,
      });
      const data: PublicJobsResult = await response.json();
      if (!response.ok || data.error || !Array.isArray(data.jobs))
        throw new Error(
          "We couldn’t refresh the latest roles. Please try again.",
        );
      if (!controller.signal.aborted) {
        setInventory(data);
        setError("");
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "We couldn’t refresh the latest roles.",
        );
    } finally {
      busy.current = false;
    }
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => {
      setReduced(media.matches);
      if (media.matches) setPaused(true);
    };
    const onResize = () => {
      const width = viewport.current?.clientWidth || 1000;
      setColumns(width < 550 ? 1 : width < 900 ? 2 : 3);
    };
    const observer = new ResizeObserver(onResize);
    const visibility = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.2 },
    );
    if (viewport.current) {
      observer.observe(viewport.current);
      visibility.observe(viewport.current);
    }
    onMotion();
    onResize();
    media.addEventListener("change", onMotion);
    return () => {
      observer.disconnect();
      visibility.disconnect();
      media.removeEventListener("change", onMotion);
    };
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (inView) void refresh();
    }, 60_000);
    const onFocus = () => {
      if (inView) void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      request.current?.abort();
    };
  }, [refresh, inView]);
  const move = useCallback(
    (next: number, manual = false) => {
      const element = viewport.current;
      const card = element?.firstElementChild as HTMLElement | null;
      if (!element || !card) return;
      const target = Math.max(0, Math.min(next, maxIndex));
      element.scrollTo({
        left: target * (card.offsetWidth + 20),
        behavior: reduced ? "instant" : "smooth",
      });
      if (manual) {
        setPaused(true);
        setAnnouncement(
          `Showing roles ${target + 1} to ${Math.min(target + columns, inventory.jobs.length)} of ${inventory.jobs.length}.`,
        );
      }
    },
    [maxIndex, reduced, columns, inventory.jobs.length],
  );
  useEffect(() => {
    if (index > maxIndex) move(maxIndex);
  }, [index, maxIndex, move]);
  useEffect(() => {
    if (paused || hovered || focused || !inView || reduced || !maxIndex) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) move(index >= maxIndex ? 0 : index + 1);
    }, 5500);
    return () => clearInterval(timer);
  }, [index, maxIndex, paused, hovered, focused, inView, reduced, move]);
  return (
    <div
      className="featured-carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label="Latest job opportunities"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      {inventory.source === "demo" && (
        <p className="demo-note">
          <span />
          Development preview · Fictional employers and sample roles.
        </p>
      )}
      {error && (
        <p className="notice" role="status">
          {error}{" "}
          {inventory.jobs.length > 0 && "Showing the last loaded roles."}{" "}
          <button
            className="text-button"
            type="button"
            onClick={() => void refresh()}
          >
            <RefreshCw size={14} />
            Try again
          </button>
        </p>
      )}
      {!error && !inventory.jobs.length && (
        <p className="notice">
          New opportunities will appear here after employer and listing review.
          Explore employers or save a search for your next chapter.
        </p>
      )}
      <div
        ref={viewport}
        className="featured-role-track"
        style={{ "--role-columns": columns } as React.CSSProperties}
        onScroll={(event) => {
          const element = event.currentTarget;
          const card = element.firstElementChild as HTMLElement | null;
          if (card)
            setIndex(Math.round(element.scrollLeft / (card.offsetWidth + 20)));
        }}
      >
        {inventory.jobs.map((job, position) => (
          <div
            className="featured-role-slide"
            key={job.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${position + 1} of ${inventory.jobs.length}`}
            inert={position < index || position >= index + columns}
          >
            <JobCard job={job} />
          </div>
        ))}
      </div>
      {inventory.jobs.length > 0 && (
        <div className="carousel-controls">
          <span className="fineprint">
            {index + 1}–{Math.min(index + columns, inventory.jobs.length)} of{" "}
            {inventory.jobs.length} latest roles
          </span>
          <div>
            <button
              className="button secondary small carousel-play"
              type="button"
              disabled={!maxIndex}
              aria-pressed={paused}
              onClick={() => setPaused(!paused)}
            >
              {paused ? <Play size={15} /> : <Pause size={15} />}
              {paused ? "Play" : "Pause"}
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label="Previous roles"
              disabled={!maxIndex}
              onClick={() => move(index <= 0 ? maxIndex : index - 1, true)}
            >
              <ArrowLeft size={18} />
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label="Next roles"
              disabled={!maxIndex}
              onClick={() => move(index >= maxIndex ? 0 : index + 1, true)}
            >
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
