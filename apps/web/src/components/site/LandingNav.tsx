"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/Wordmark";
import { useMagnetic, useScrollY } from "@/components/motion";
import { activeChain } from "@/lib/chain.config";

const SECTIONS = [
  { id: "mechanism", label: "Mechanism" },
  { id: "modules", label: "Modules" },
  { id: "universe", label: "Universe" },
  { id: "live", label: "Live" },
  { id: "thesis", label: "Thesis" },
];

/**
 * The landing header.
 *
 * Five anchors, a network chip and a single call to action — a marketing page offering
 * eleven destinations is a page with no argument. The current section is tracked by
 * observing the anchors themselves, so the rail always agrees with what is on screen,
 * and below `md` the anchors collapse into a sheet rather than disappearing.
 */
export function LandingNav() {
  const scrolled = useScrollY(40);
  const [active, setActive] = useState<string>("");
  const [open, setOpen] = useState(false);
  const cta = useMagnetic<HTMLAnchorElement>(5, 110);

  useEffect(() => {
    const targets = SECTIONS.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => Boolean(el)
    );
    if (targets.length === 0 || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
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

  // A menu that survives a route change or an escape key is the minimum bar.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      // Solid paper once scrolled, never translucent: the page passes under a black
      // data band, and a semi-transparent white bar over black reads as muddy grey.
      className={`sticky top-0 z-chrome transition-all duration-700 ease-osk ${
        scrolled || open ? "border-b border-line bg-paper" : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="shell flex h-[76px] items-center justify-between gap-6">
        <Link href="/" aria-label="Osinko home" className="shrink-0 transition-opacity hover:opacity-60">
          <Wordmark />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={`relative py-1 font-mono text-micro font-medium uppercase transition-colors duration-300 ${
                active === s.id ? "text-ink" : "text-faint hover:text-ink"
              }`}
            >
              {s.label}
              <span
                className={`absolute -bottom-0.5 left-0 h-px w-full origin-left bg-cyan-dark transition-transform duration-500 ease-osk ${
                  active === s.id ? "scale-x-100" : "scale-x-0"
                }`}
                aria-hidden
              />
            </a>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <Link
            href="/docs"
            className="hidden px-2 py-1 font-mono text-micro font-medium uppercase text-faint transition-colors duration-300 hover:text-ink md:inline-block"
          >
            Docs
          </Link>
          <span className="pill-live hidden lg:inline-flex">
            <span className="beacon" aria-hidden />
            Live · Chain {activeChain.id}
          </span>
          <Link ref={cta} href="/app" className="btn-primary btn-sm magnetic">
            Open the app
          </Link>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="flex h-9 w-9 items-center justify-center border border-line text-ink transition-colors hover:border-ink md:hidden"
          >
            <span className="relative block h-2.5 w-4" aria-hidden>
              <span
                className={`absolute left-0 block h-px w-full bg-current transition-transform duration-300 ease-osk ${
                  open ? "top-1/2 rotate-45" : "top-0"
                }`}
              />
              <span
                className={`absolute left-0 block h-px w-full bg-current transition-transform duration-300 ease-osk ${
                  open ? "top-1/2 -rotate-45" : "top-full"
                }`}
              />
            </span>
          </button>
        </div>
      </div>

      {/* The sheet. Grid-rows animation so it opens without a fixed height guess. */}
      <div
        className={`grid overflow-hidden border-t border-line-soft transition-[grid-template-rows] duration-500 ease-osk md:hidden ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr] border-t-transparent"
        }`}
      >
        <nav className="min-h-0">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={() => setOpen(false)}
              className="flex items-center justify-between border-b border-line-soft px-5 py-4 font-mono text-micro font-medium uppercase text-muted"
            >
              {s.label}
              <span className="text-ghost">→</span>
            </a>
          ))}
          <Link
            href="/docs"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between px-5 py-4 font-mono text-micro font-medium uppercase text-muted"
          >
            Docs
            <span className="text-ghost">→</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
