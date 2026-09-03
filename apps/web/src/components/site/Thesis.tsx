"use client";

import Link from "next/link";
import { Reveal } from "@/components/motion";
import { Folio } from "@/components/site/Folio";

const COMPARISON = [
  { term: "Reinvesting", them: "The day after pay day, market hours only", us: "The same moment you get paid" },
  { term: "Hours", them: "Weekdays, 9:30 to 4", us: "Every second of every day" },
  { term: "Part of a share", them: "Stuck inside one app", us: "A token you hold yourself" },
  { term: "When you get paid", them: "Three weeks after you qualify", us: "The day you qualify, minus 1%" },
  { term: "How often", them: "One lump, four times a year", us: "A little every second" },
  { term: "Borrowing", them: "A margin account, interest piles up", us: "The dividends pay the interest" },
];

/**
 * The argument, written out.
 *
 * A long read is a status signal in itself: it says the product came from a thesis
 * rather than a template. Set at a 62-character measure with a drop cap and one pull
 * quote — the typography of something meant to be read, not skimmed. The words are
 * kept plain on purpose: the case for the product should not need a finance degree.
 */
export function Thesis() {
  return (
    <section id="thesis" className="relative py-band">
      <Reveal className="shell">
        <Folio serial="Why this exists" index={6} />

        <div className="mt-12 grid gap-16 lg:grid-cols-12 lg:gap-14">
          <article className="min-w-0 lg:col-span-7">
            <h2 className="reveal display text-display">
              Why dividends are
              <br />
              still broken
            </h2>

            <p className="reveal reveal-1 kicker mt-8 max-w-prose text-[19px] leading-relaxed md:text-[21px]">
              A dividend is a simple promise. A company makes money and hands some of it
              back to you. The promise still works. The way the money reaches you does not.
            </p>

            <div className="reveal reveal-2 mt-10 max-w-prose space-y-6 text-[16.5px] leading-[1.75] text-muted">
              <p className="first-letter:float-left first-letter:mr-2.5 first-letter:mt-1.5 first-letter:font-display first-letter:text-[68px] first-letter:font-semibold first-letter:leading-[0.72] first-letter:text-ink">
                Say a stock “goes ex” on a Monday. That is the day you must own it to get the
                next payout. The company pays three weeks later, on a Friday. In between, the
                money is yours and it does nothing. It sits at a middleman while you wait.
                That wait is not a law of nature. It is a habit left over from paper
                certificates and the post.
              </p>
              <p>
                Then the money arrives as one lump, four times a year. Nothing else in your
                life runs on a quarterly schedule. Your dividends do, because that is how
                often a board of directors meets.
              </p>
              <p>
                Reinvesting is worse. Your broker buys more stock the trading day after pay
                day, only during market hours, and the fraction of a share you get cannot
                leave their app. All of that happens for one reason: the dividend never
                touched a system that could act on it right away.
              </p>
            </div>

            {/* The pull quote. Once per essay, and it has to earn it. */}
            <blockquote className="reveal reveal-3 my-12 border-l border-cyan py-2 pl-7">
              <p className="font-editorial text-[24px] italic leading-[1.35] text-ink md:text-[30px]">
                Put the stock on a blockchain, and every one of those limits goes away.
              </p>
            </blockquote>

            <div className="reveal reveal-3 max-w-prose space-y-6 text-[16.5px] leading-[1.75] text-muted">
              <p>
                The ex date is just a record of who owned what. The three week wait is a loan
                problem, and a pool of cash solves loan problems. The lump is a choice; a
                computer can pay by the second just as easily. Reinvesting is slow because
                markets close, and a pool of money does not.
              </p>
              <p>
                And once the stock is on chain, it can do what stocks have always done for
                the wealthy: back a loan. That is where the name comes from.{" "}
                <span className="text-ink">Aave</span> is the biggest lending market in crypto.{" "}
                <span className="text-ink">Osinko</span> is Finnish for dividend. Osinko is the
                Aave of stocks: put your stock in, borrow against it, and let the dividends
                pay the interest. The oldest private banking trick there is, without the
                private banker.
              </p>
              <p className="text-[19px] font-semibold leading-relaxed text-ink">
                Nothing here is a new financial product. It is the same dividend, finally put
                to work.
              </p>
            </div>
          </article>

          {/* The side rail */}
          <aside className="min-w-0 space-y-6 lg:col-span-5">
            <div className="reveal reveal-1 card card-pad lg:sticky lg:top-28">
              <div className="serial">Side by side</div>
              <h3 className="mt-4 display text-title">
                Your broker today, and Osinko
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
                  The pool
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
            Read how it works
          </Link>
          <span className="font-mono text-nano uppercase text-ghost">
            No wallet needed to look around
          </span>
        </div>
      </Reveal>
    </section>
  );
}
