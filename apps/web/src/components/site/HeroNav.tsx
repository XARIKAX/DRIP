"use client";

import Link from "next/link";
import { useState } from "react";
import { Wordmark } from "@/components/Wordmark";
import { useMagnetic } from "@/components/motion";

export const SECTIONS = [
  { id: "mechanism", label: "How it works" },
  { id: "modules", label: "What you can do" },
  { id: "universe", label: "Stocks" },
  { id: "live", label: "See it run" },
  { id: "thesis", label: "Why" },
] as const;

/**
 * The header, inside the frame.
 *
 * Not sticky, and not the same component as the one that follows you down the page.
 * The hero is a composition — a lit object under a headline inside a bordered plate —
 * and a bar that detaches and floats over it breaks the plate. So this one belongs to
 * the hero and scrolls away with it, and `StickyNav` fades in afterwards to do the
 * navigating. Two components rather than one with a mode, because they have almost
 * nothing in common beyond the links.
 */
export function HeroNav() {
  const cta = useMagnetic<HTMLAnchorElement>(5, 120);
  const [open, setOpen] = useState(false);

  return (
    <div className="relative z-20 px-5 pt-5 md:px-10 md:pt-7">
      <div className="mx-auto flex w-full max-w-shell items-center justify-between gap-6">
        <Link href="/" aria-label="Osinko home" className="shrink-0 transition-opacity duration-300 hover:opacity-70">
          <Wordmark />
        </Link>

        {/* Centred independently of the flanking columns, so the links sit on the
            page's axis rather than on whatever is left over after the logo. */}
        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-9 lg:flex">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="font-serif text-[14px] text-ink/75 transition-colors duration-300 hover:text-ink"
            >
              {s.label}
            </a>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <Link
            href="/docs"
            className="hidden font-serif text-[14px] text-ink/75 transition-colors duration-300 hover:text-ink md:inline-block"
          >
            Guide
          </Link>
          <Link ref={cta} href="/app" className="btn-primary btn-sm magnetic">
            Open the app <span aria-hidden>→</span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu"}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line-strong text-ink transition-colors hover:border-ink lg:hidden"
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

      {/* The sheet. Grid rows animate without a height guess. */}
      <div
        className={`mx-auto grid max-w-shell overflow-hidden transition-[grid-template-rows] duration-500 ease-osk lg:hidden ${
          open ? "mt-4 grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <nav className="min-h-0">
          <div className="rounded-xl border border-line bg-paper/85 p-2 backdrop-blur">
            {[...SECTIONS, { id: "docs", label: "Guide" }].map((s) => (
              <a
                key={s.id}
                href={s.id === "docs" ? "/docs" : `#${s.id}`}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between rounded-md px-4 py-3 font-serif text-[15px] text-muted transition-colors hover:bg-ground-2 hover:text-ink"
              >
                {s.label}
                <span aria-hidden className="text-faint">→</span>
              </a>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
