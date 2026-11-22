"use client";
import { usePathname } from "next/navigation";
import { HomeSkeleton } from "@/components/home-skeleton";

export default function Loading() {
  const pathname = usePathname();
  if (pathname === "/") return <HomeSkeleton />;
  return (
    <main id="main" className="container section" aria-busy="true">
      <p className="eyebrow" role="status">
        Your next chapter is loading…
      </p>
      <div className="loading-grid" aria-hidden="true">
        {[1, 2, 3].map((i) => (
          <div className="loading-card" key={i}>
            <span />
            <span />
            <span />
          </div>
        ))}
      </div>
    </main>
  );
}
