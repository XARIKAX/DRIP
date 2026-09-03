"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/Wordmark";
import { useScrollY } from "@/components/motion";
import { activeChain } from "@/lib/chain.config";

const SECTIONS = [
  { id: "mechanism", label: "Mechanism" },
  { id: "modules", label: "Modules" },
  { id: "live", label: "Live" },
  { id: "thesis", label: "Thesis" },
];

/**
 * The landing header.
 *
 * Four anchors, a network chip and a single call to action — a marketing page that
 * offers eleven destinations is a page with no argument. The current section is
 * tracked by observing the anchors themselves, so the rail always agrees with what
 * is actually on screen.
 */
export function LandingNav() {
  const scrolled = useScrollY(40);
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    const targets = SECTIONS.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => Boolean(el)
    );
    if (targets.length === 0 || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        // The section occupying the most of the upper viewport wins the marker.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0.05, 0.3, 0.6] }
    );

    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, []);

  return (
    <header
      className={`sticky top-0 z-chrome transition-all duration-700 ease-osk ${
        scrolled
          ? "border-b border-line-soft bg-void/80 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="shell flex h-[76px] items-center justify-between gap-6">
        <Link href="/" aria-label="Osinko home" className="shrink-0 transition-opacity hover:opacity-70">
          <Wordmark />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={`relative py-1 font-mono text-micro font-medium uppercase transition-colors duration-300 ${
                active === s.id ? "text-chalk" : "text-faint hover:text-chalk"
              }`}
            >
              {s.label}
              <span
                className={`absolute -bottom-0.5 left-0 h-px w-full origin-left bg-cyan transition-transform duration-500 ease-osk ${
                  active === s.id ? "scale-x-100" : "scale-x-0"
                }`}
                aria-hidden
              />
            </a>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-4">
          <span className="pill-live hidden lg:inline-flex">
            <span className="beacon" aria-hidden />
            Live · Chain {activeChain.id}
          </span>
          <Link href="/app" className="btn-primary btn-sm">
            Open the app
          </Link>
        </div>
      </div>
    </header>
  );
}
