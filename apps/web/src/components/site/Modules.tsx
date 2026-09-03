"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Reveal, usePointerGlow } from "@/components/motion";
import { Folio } from "@/components/site/Folio";

const MODULES = [
  {
    index: "01",
    name: "Early",
    claim: "Get paid the day you qualify, not three weeks later.",
    body: "Most companies pay a dividend about three weeks after you qualify for it. Osinko pays you on day one. A pool of USDG fronts the money and takes 1% for doing it. That 1% goes to the people who put cash into the pool.",
    stat: "21",
    unit: "days early",
    href: "/app/vault",
    cta: "See the pool",
  },
  {
    index: "02",
    name: "Stream",
    claim: "A little every second, not one lump a quarter.",
    body: "Your dividend pays out steadily from the day you qualify to the day the company pays. Collect it whenever you want. No market hours, no waiting for the quarter to end.",
    stat: "1",
    unit: "second",
    href: "/app",
    cta: "See it drip",
  },
  {
    index: "03",
    name: "Reinvest",
    claim: "Buys more stock the moment the money lands.",
    body: "Every payout buys more of the same stock right away, in the same transaction. No waiting a day, no fraction of a share stuck inside an app. Your next dividend is bigger because you own more.",
    stat: "0",
    unit: "days of delay",
    href: "/app/deposit",
    cta: "Pick a mode",
  },
  {
    index: "04",
    name: "Borrow",
    claim: "Your dividends pay the interest.",
    body: "Borrow USDG against your stock without selling a share. Every dividend the stock earns goes toward the interest first. Borrow a modest amount and the loan pays for itself.",
    stat: "40",
    unit: "% max loan",
    href: "/app/borrow",
    cta: "Open a loan",
  },
  {
    index: "05",
    name: "Split",
    claim: "Sell the dividend on its own.",
    body: "Turn one share into two tokens. One is the share itself, which you get back in full on a set date. The other is every dividend the share pays until then. Sell either one, or put them back together at any time for free.",
    stat: "0.1",
    unit: "% fee to split",
    href: "/app/split",
    cta: "Split a stock",
  },
  {
    index: "06",
    name: "Agent",
    claim: "Say what you want in plain words.",
    body: "Type “reinvest my Microsoft dividends” or “borrow $5,000”. The agent shows you a plan with the numbers filled in. Nothing happens until you approve it and sign with your own wallet.",
    stat: "6",
    unit: "commands",
    href: "/app/agent",
    cta: "Try the agent",
  },
];

/**
 * The five modules.
 *
 * A list, not a grid of cards. Cards force five things to be equally important and
 * equally shallow; a list lets one be open at a time and say something worth reading.
 * Hover, focus and the arrow keys all move the selection, and a cyan marker slides to
 * whichever row is live — so the connection between the list and the panel beside it is
 * something you can watch rather than something you have to infer.
 */
export function Modules() {
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const [marker, setMarker] = useState({ top: 0, height: 0 });
  const glow = usePointerGlow<HTMLDivElement>();
  const current = MODULES[active];

  // The marker is measured from the DOM rather than computed, so it stays correct at
  // every breakpoint and after a font swap changes the row heights.
  const measure = useCallback(() => {
    const list = listRef.current;
    const row = list?.children[active] as HTMLElement | undefined;
    if (!list || !row) return;
    setMarker({ top: row.offsetTop, height: row.offsetHeight });
  }, [active]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    void fonts?.ready.then(measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      setActive((i) => (i + 1) % MODULES.length);
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      setActive((i) => (i - 1 + MODULES.length) % MODULES.length);
    }
  };

  return (
    <section id="modules" className="relative py-band">
      <Reveal className="shell">
        <Folio serial="Six ways to use it" index={3} />
        <div className="mt-12 flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <h2 className="reveal reveal-1 max-w-2xl display text-display">
              Keep it, borrow on it, or sell the dividend
            </h2>
          </div>
          <p className="reveal reveal-2 max-w-sm text-[15px] leading-relaxed text-muted">
            Four of these never touch your shares. The dividend becomes a steady drip, more
            stock, or a way to pay a loan, and the share stays whole. Split is the one that
            does touch the share, and only if you ask it to.
          </p>
        </div>

        <div className="mt-16 grid gap-12 lg:grid-cols-12 lg:gap-16">
          {/* The list */}
          <div className="reveal reveal-2 relative min-w-0 lg:col-span-7">
            {/* The marker. One element, moved — not five states toggled. */}
            <span
              className="absolute left-0 w-px bg-cyan-dark transition-all duration-700 ease-osk"
              style={{ top: marker.top, height: marker.height }}
              aria-hidden
            />

            <ul ref={listRef} onKeyDown={onKeyDown}>
              {MODULES.map((m, i) => {
                const on = i === active;
                return (
                  <li key={m.index}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onFocus={() => setActive(i)}
                      onClick={() => setActive(i)}
                      aria-pressed={on}
                      className="group grid w-full grid-cols-[auto_1fr_auto] items-center gap-6 border-t border-line-soft py-7 pl-6 text-left transition-colors duration-500 last:border-b"
                    >
                      <span
                        className={`num text-micro font-medium transition-colors duration-500 ${
                          on ? "text-cyan-deep" : "text-ghost"
                        }`}
                      >
                        {m.index}
                      </span>

                      <span className="min-w-0">
                        <span
                          className={`display block text-[clamp(32px,4.2vw,56px)] leading-[1] transition-all duration-500 ease-osk ${
                            on ? "text-ink" : "text-faint group-hover:text-ink"
                          }`}
                          style={{ transform: on ? "translateX(10px)" : "translateX(0)" }}
                        >
                          {m.name}
                        </span>
                        <span
                          className={`mt-2 block text-[14px] text-muted transition-all duration-500 ease-osk ${
                            on ? "opacity-100" : "opacity-0"
                          }`}
                          style={{ transform: on ? "translateX(10px)" : "translateX(0)" }}
                        >
                          {m.claim}
                        </span>
                      </span>

                      {/* Every row keeps its figure; only the live one takes the ink. A list
                          whose numbers vanish until hovered reads as six disabled rows. */}
                      <span className="hidden shrink-0 items-baseline gap-1.5 sm:flex">
                        <span
                          className={`figure text-[30px] leading-none transition-colors duration-500 ${
                            on ? "text-cyan-deep" : "text-ghost"
                          }`}
                        >
                          {m.stat}
                        </span>
                        <span
                          className={`ml-2 font-mono text-nano uppercase transition-colors duration-500 ${
                            on ? "text-faint" : "text-ghost"
                          }`}
                        >
                          {m.unit}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* The detail. Sticky so it stays beside whichever row you are on. */}
          <div className="reveal reveal-3 min-w-0 lg:col-span-5">
            <div ref={glow} className="certificate spotlight p-7 md:p-9 lg:sticky lg:top-28">
              <div className="flex items-start justify-between gap-4">
                <span className="pill-live">Module {current.index}</span>
                <span className="flex items-baseline gap-1.5 sm:hidden">
                  <span className="figure text-[26px] leading-none text-cyan-deep">{current.stat}</span>
                  <span className="font-mono text-nano uppercase text-faint">
                    {current.unit}
                  </span>
                </span>
              </div>

              <h3 className="mt-8 display text-headline">
                {current.claim}
              </h3>

              <p key={current.index} className="mt-5 text-[15px] leading-[1.7] text-muted">
                {current.body}
              </p>

              <div className="mt-9 border-t border-line-soft pt-7">
                <Link href={current.href} className="btn-ghost btn-sm">
                  {current.cta}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
