"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Mark } from "@/components/Wordmark";
import { useMagnetic } from "@/components/motion";
import { SECTIONS } from "@/components/site/HeroNav";

/**
 * The header that arrives once the hero has gone.
 *
 * Condensed, translucent, and it tracks which section is on screen — the work the old
 * landing header did, minus the wordmark lockup, because at this size a mark alone is
 * enough and the name is three inches above it in the reader's memory. It mounts hidden
 * and fades in past the first viewport rather than being rendered conditionally, so
 * there is no layout shift when it appears.
 */
export function StickyNav() {
  const [shown, setShown] = useState(false);
  const [active, setActive] = useState<string>("");
  const cta = useMagnetic<HTMLAnchorElement>(4, 100);

  useEffect(() => {
    let frame = 0;
    const sample = () => {
      frame = 0;
      setShown(window.scrollY > window.innerHeight * 0.75);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(sample);
    };
    sample();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

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

  return (
    <header
      className={`fixed inset-x-0 top-0 z-chrome transition-all duration-500 ease-osk ${
        shown ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-full opacity-0"
      }`}
    >
      <div className="border-b border-line bg-ground/85 backdrop-blur-xl">
        <div className="shell flex h-[62px] items-center justify-between gap-6">
          <Link href="/" aria-label="Osinko home" className="text-ink transition-opacity hover:opacity-70">
            <Mark size={22} />
          </Link>

          <nav className="hidden items-center gap-8 lg:flex">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={`relative py-1 font-serif text-[14px] transition-colors duration-300 ${
                  active === s.id ? "text-ink" : "text-faint hover:text-ink"
                }`}
              >
                {s.label}
                {/* Two cells of stone, set where the underline used to be. */}
                <span
                  className={`absolute -bottom-0.5 left-1/2 h-[3px] w-[6px] -translate-x-1/2 rounded-[1px] bg-accent transition-opacity duration-300 ${
                    active === s.id ? "opacity-100" : "opacity-0"
                  }`}
                  aria-hidden
                />
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/docs"
              className="hidden font-serif text-[14px] text-faint transition-colors duration-300 hover:text-ink md:inline-block"
            >
              Guide
            </Link>
            <Link ref={cta} href="/app" className="btn-primary btn-sm magnetic">
              Open the app
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
