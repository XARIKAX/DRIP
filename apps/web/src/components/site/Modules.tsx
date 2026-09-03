"use client";

import Link from "next/link";
import { useState } from "react";
import { Reveal } from "@/components/motion";

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
 * Hover or focus moves the selection, so a mouse browses it and a keyboard walks it.
 */
export function Modules() {
  const [active, setActive] = useState(0);
  const current = MODULES[active];

  return (
    <section id="modules" className="relative border-t border-line-soft py-band">
      <Reveal className="shell">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <div className="reveal eyebrow">Five modules</div>
            <h2 className="reveal reveal-1 mt-5 max-w-2xl text-display font-black tracking-cut text-lit">
              One deposit, both sides
            </h2>
          </div>
          <p className="reveal reveal-2 max-w-sm text-[15px] leading-relaxed text-dim">
            Income on one side, credit on the other, each feeding the other. A quarterly
            cheque becomes a continuous, compounding, borrowable position.
          </p>
        </div>

        <div className="mt-16 grid gap-12 lg:grid-cols-12 lg:gap-16">
          {/* The list */}
          <ul className="reveal reveal-2 min-w-0 lg:col-span-7">
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
                    className="group grid w-full grid-cols-[auto_1fr_auto] items-center gap-6 border-t border-line-soft py-7 text-left transition-colors duration-500 last:border-b"
                  >
                    <span
                      className={`num text-micro font-medium transition-colors duration-500 ${
                        on ? "text-cyan" : "text-ghost"
                      }`}
                    >
                      {m.index}
                    </span>

                    <span className="min-w-0">
                      <span
                        className={`block text-[clamp(30px,4vw,52px)] font-black leading-[0.95] tracking-cut transition-all duration-500 ease-osk ${
                          on ? "text-chalk" : "text-ghost group-hover:text-dim"
                        }`}
                        style={{ transform: on ? "translateX(12px)" : "translateX(0)" }}
                      >
                        {m.name}
                      </span>
                      <span
                        className={`mt-2 block text-[14px] transition-all duration-500 ease-osk ${
                          on ? "text-dim opacity-100" : "text-ghost opacity-0 lg:opacity-0"
                        }`}
                        style={{ transform: on ? "translateX(12px)" : "translateX(0)" }}
                      >
                        {m.claim}
                      </span>
                    </span>

                    <span
                      className={`hidden shrink-0 items-baseline gap-1.5 transition-opacity duration-500 sm:flex ${
                        on ? "opacity-100" : "opacity-0"
                      }`}
                    >
                      <span className="figure text-[30px] leading-none text-cyan">{m.stat}</span>
                      <span className="font-mono text-nano uppercase text-faint">{m.unit}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* The detail. Sticky so it stays beside whichever row you are on. */}
          <div className="reveal reveal-3 min-w-0 lg:col-span-5">
            <div className="card card-pad lg:sticky lg:top-28">
              <div className="flex items-start justify-between gap-4">
                <span className="pill-live">Module {current.index}</span>
                <span className="flex items-baseline gap-1.5 sm:hidden">
                  <span className="figure text-[26px] leading-none text-cyan">{current.stat}</span>
                  <span className="font-mono text-nano uppercase text-faint">{current.unit}</span>
                </span>
              </div>

              <h3 className="mt-8 text-headline font-black tracking-cut text-chalk">
                {current.claim}
              </h3>

              <p key={current.index} className="mt-5 text-[15px] leading-[1.7] text-dim">
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
