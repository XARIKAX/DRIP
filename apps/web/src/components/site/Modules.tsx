"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Reveal, usePointerGlow } from "@/components/motion";
import { Folio } from "@/components/site/Folio";

const MODULES = [
  {
    index: "01",
    name: "Early",
    claim: "Paid at the ex date, not the pay date.",
    body: "A USDG vault fronts the dividend the moment your shares go ex. The three week wait between the date you earn the money and the date a transfer agent releases it becomes zero. The vault takes one percent and keeps it as yield for the people who funded it.",
    stat: "21",
    unit: "days early",
    href: "/app/vault",
    cta: "Open the vault",
  },
  {
    index: "02",
    name: "Stream",
    claim: "Per second, not per quarter.",
    body: "Your entitlement stops being a lump and becomes a flow. It accrues every second from the ex date to the pay date and you draw it whenever you want — no calendar, no market hours, no cutoff at midnight.",
    stat: "1",
    unit: "second resolution",
    href: "/app",
    cta: "See your streams",
  },
  {
    index: "03",
    name: "Reinvest",
    claim: "Compounded in the same transaction.",
    body: "Every claim swaps straight into more of the same stock token and returns to your position without the cash ever touching your wallet. No trading day delay, no fractional share trapped inside an app. The next dividend is calculated on a bigger balance.",
    stat: "0",
    unit: "days of drag",
    href: "/app/deposit",
    cta: "Set a mode",
  },
  {
    index: "04",
    name: "Borrow",
    claim: "Your dividends pay the interest.",
    body: "Draw USDG against your holdings without selling a share. Every dividend the collateral earns is applied against the interest before anything else, so at a conservative loan the yield covers the whole rate and the position carries itself.",
    stat: "40",
    unit: "% max LTV",
    href: "/app/borrow",
    cta: "Open a line",
  },
  {
    index: "05",
    name: "Split",
    claim: "The one module that wraps the share.",
    body: "Deposit a stock token and receive two: a Principal Token redeemable for the whole share at maturity, and a Yield Token that carries every dividend it pays before then. Trade the drip on its own, or merge the two back at par, free, whenever you want the certificate whole again.",
    stat: "10",
    unit: "bps split fee",
    href: "/app/split",
    cta: "Split a position",
  },
  {
    index: "06",
    name: "Agent",
    claim: "Your strategy, in one sentence.",
    body: "Every action in the protocol is exposed over MCP. Tell an agent to compound, claim, or borrow and it returns a plan with the numbers filled in. You confirm it with your own key. Nothing executes without a signature.",
    stat: "6",
    unit: "MCP tools",
    href: "/app/agent",
    cta: "Open the console",
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
        <Folio serial="Six modules" index={3} />
        <div className="mt-12 flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <h2 className="reveal reveal-1 max-w-2xl display text-display">
              Hold it, borrow on it, or trade it
            </h2>
          </div>
          <p className="reveal reveal-2 max-w-sm text-[15px] leading-relaxed text-muted">
            Early, Stream, Reinvest and Borrow never wrap the share — a quarterly cheque
            becomes a continuous, compounding, borrowable position, and the certificate
            stays whole. Split is the exception, and it is opt in: wrap it anyway, and the
            dividend becomes its own liquid position.
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
