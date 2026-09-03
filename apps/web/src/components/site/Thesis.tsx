"use client";

import Link from "next/link";
import { Reveal } from "@/components/motion";
import { Folio } from "@/components/site/Folio";

const COMPARISON = [
  { term: "Reinvestment", them: "Trading day after the pay date", us: "The same transaction as the claim" },
  { term: "Hours", them: "Market hours, midnight cutoff", us: "Every second of every day" },
  { term: "Fractional shares", them: "Locked inside one app", us: "Self custodied ERC-20" },
  { term: "Cash timing", them: "Pay date, weeks after ex", us: "Ex date, minus one percent" },
  { term: "Cadence", them: "A quarterly lump", us: "A continuous stream" },
  { term: "Borrowing", them: "Margin account, interest drag", us: "Dividends service the interest" },
];

/**
 * The argument, written out.
 *
 * A long read is a status signal in itself: it says the product came from a thesis
 * rather than a template. Set at a 62-character measure with a drop cap and one pull
 * quote — the typography of something meant to be read, not skimmed.
 */
export function Thesis() {
  return (
    <section id="thesis" className="relative py-band">
      <Reveal className="shell">
        <Folio serial="The thesis" index={6} />

        <div className="mt-12 grid gap-16 lg:grid-cols-12 lg:gap-14">
          <article className="min-w-0 lg:col-span-7">
            <h2 className="reveal display text-display">
              Why dividends are
              <br />
              still broken
            </h2>

            <p className="reveal reveal-1 kicker mt-8 max-w-prose text-[19px] leading-relaxed md:text-[21px]">
              A dividend is the oldest promise in finance. A company earns money and hands
              some of it back. The promise still works. The plumbing does not.
            </p>

            <div className="reveal reveal-2 mt-10 max-w-prose space-y-6 text-[16.5px] leading-[1.75] text-muted">
              <p className="first-letter:float-left first-letter:mr-2.5 first-letter:mt-1.5 first-letter:font-display first-letter:text-[68px] first-letter:font-semibold first-letter:leading-[0.72] first-letter:text-ink">
                The shares go ex on a Monday. The company pays on a Friday three weeks later.
                In between, the money exists, is owed to you, and does nothing at all. It sits
                in a ledger at a transfer agent while you wait for it. That gap is not a law of
                nature. It is a settlement convention inherited from an era of paper
                certificates and postal mail.
              </p>
              <p>
                Then the money arrives as a lump. One payment, four times a year. Nothing about
                your life is quarterly, but your income from a stock is, because that is how
                often a board meets.
              </p>
              <p>
                Reinvestment is worse. Robinhood documents its own terms plainly: reinvestment
                happens on the trading day after the pay date, during market hours, subject to a
                midnight cutoff, and the fractional share you receive cannot leave the app.
                Every one of those limits comes from the same place — the dividend never touched
                a system that could act on it immediately.
              </p>
            </div>

            {/* The pull quote. Once per essay, and it has to earn it. */}
            <blockquote className="reveal reveal-3 my-12 border-l border-cyan py-2 pl-7">
              <p className="font-editorial text-[24px] italic leading-[1.35] text-ink md:text-[30px]">
                Put the stock token onchain and every one of those limits becomes optional.
              </p>
            </blockquote>

            <div className="reveal reveal-3 max-w-prose space-y-6 text-[16.5px] leading-[1.75] text-muted">
              <p>
                The ex date snapshot is a checkpoint. The three week wait is a credit problem,
                and credit is exactly what a vault is for. The lump is an accounting choice, and
                per second accrual is cheaper to compute than a quarterly batch. The
                reinvestment delay is a market hours artefact, and a pool does not keep office
                hours.
              </p>
              <p>
                And once the stock lives onchain it can finally do what collateral has always
                done on Wall Street: back a loan. This is where the name comes from.{" "}
                <span className="text-ink">Aave</span> is Finnish for ghost;{" "}
                <span className="text-ink">osinko</span> is Finnish for dividend. Osinko is
                the Aave of dividends — one deposit that streams income and secures credit at
                once, where the dividends the collateral keeps earning are applied straight
                against the interest. The oldest private banking product there is, minus the
                private banker.
              </p>
              <p className="text-[19px] font-semibold leading-relaxed text-ink">
                Nothing here is a new financial instrument. It is the same dividend, finally put
                to work.
              </p>
            </div>
          </article>

          {/* The side rail */}
          <aside className="min-w-0 space-y-6 lg:col-span-5">
            <div className="reveal reveal-1 card card-pad lg:sticky lg:top-28">
              <div className="serial">Side by side</div>
              <h3 className="mt-4 display text-title">
                The same name, a different machine
              </h3>

              {/* Column headings once, at the top. Repeating "Osinko" on all six rows
                  turned the accent into wallpaper and said nothing six times. */}
              <div className="mt-8 grid grid-cols-[1fr_1fr] gap-5 rule-double-b pb-2.5">
                <div className="serial">Today</div>
                <div className="serial pl-5 text-cyan-deep">Osinko</div>
              </div>

              <div>
                {COMPARISON.map((row) => (
                  <div
                    key={row.term}
                    className="grid grid-cols-[1fr_1fr] gap-5 border-b border-line-soft py-4 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] leading-snug text-faint line-through decoration-faint/40">
                        {row.them}
                      </div>
                      <div className="mt-1.5 font-mono text-nano uppercase text-ghost">
                        {row.term}
                      </div>
                    </div>
                    <div className="min-w-0 border-l border-line-soft pl-5">
                      <div className="text-[13px] font-medium leading-snug text-ink">{row.us}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 grid grid-cols-2 gap-3 border-t border-line-soft pt-7">
                <Link href="/app/vault" className="btn-quiet btn-sm justify-center">
                  The vault
                </Link>
                <Link href="/app/agent" className="btn-quiet btn-sm justify-center">
                  The agent
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </Reveal>
    </section>
  );
}

/**
 * The close.
 *
 * One line, at the largest size on the page, and one thing to do. A closing section
 * with three competing calls to action is a closing section that closes nothing.
 */
export function Closing() {
  return (
    <section className="relative overflow-hidden border-t border-line-soft">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(900px 400px at 50% 120%, rgba(53,194,219,0.16), transparent 70%)",
        }}
        aria-hidden
      />

      <Reveal className="shell relative py-band">
        <h2 className="display max-w-5xl text-hero">
          <span className="mask-line">
            <span>Let the dividends</span>
          </span>
          <span className="mask-line">
            <span className="italic">do the work.</span>
          </span>
        </h2>

        <div className="reveal reveal-3 mt-14 flex flex-wrap items-center gap-4">
          <Link href="/app" className="btn-primary btn-lg">
            Open the app
          </Link>
          <Link href="/docs" className="btn-ghost btn-lg">
            Read the docs
          </Link>
          <span className="font-mono text-nano uppercase text-ghost">
            No wallet required to look around
          </span>
        </div>
      </Reveal>
    </section>
  );
}
