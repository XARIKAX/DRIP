"use client";

import Link from "next/link";
import { MaskLine, Reveal, useMagnetic, useTilt } from "@/components/motion";
import { HeroCounter } from "@/components/HeroCounter";
import { usePortfolioSummary, useTokensView } from "@/lib/data/provider";
import { fmt, shortDate } from "@/components/live";

const RAIL = [
  { value: "21", unit: "days", label: "Paid before the pay date" },
  { value: "1", unit: "sec", label: "Accrual resolution" },
  { value: "5.8", unit: "%", label: "Borrow rate, floating" },
  { value: "40", unit: "%", label: "Maximum loan to value" },
];

/**
 * The hero.
 *
 * One argument, stated three ways: a headline that says what you get, an object that
 * shows the mechanism, and a number that proves it is already running.
 *
 * The composition is deliberately asymmetric — type anchored hard left on paper, the
 * object floating right as the page's first black panel — so the page reads as designed
 * rather than as a template filled in.
 */
export function Hero() {
  const tokens = useTokensView();
  const summary = usePortfolioSummary();
  const primary = useMagnetic<HTMLAnchorElement>(7, 140);
  const secondary = useMagnetic<HTMLAnchorElement>(5, 120);

  // The hero object shows a real token from the live universe, not a mock.
  const lead = tokens.find((t) => t.symbol === "AAPL") ?? tokens[0];

  return (
    <section className="relative isolate overflow-hidden">
      {/* Atmosphere: engineering paper and nothing else. A cyan wash on white reads as
          a smudge rather than as light, so the paper is left alone. */}
      <div className="pointer-events-none absolute inset-0 grid-bg grid-fade" aria-hidden />

      {/* The name, cropped by the fold. Scale contrast is the whole trick. */}
      <div
        className="pointer-events-none absolute -bottom-[7vw] left-0 w-full select-none overflow-hidden"
        aria-hidden
      >
        <div className="shell text-cut text-colossal font-black leading-[0.75]">OSINKO</div>
      </div>

      <Reveal className="shell relative pb-14 pt-16 md:pb-20 md:pt-24 lg:pt-28">
        <div className="grid items-start gap-14 lg:grid-cols-12 lg:gap-10">
          {/* The argument */}
          <div className="min-w-0 lg:col-span-7">
            <div className="reveal flex flex-wrap items-center gap-3">
              <span className="pill-live">
                <span className="beacon" aria-hidden />
                The Aave of dividends
              </span>
              <span className="pill">Robinhood Chain</span>
            </div>

            {/* Two lines at full scale, then a deliberate step down — the third beat is
                the consequence of the first two, and should not shout as loudly. */}
            <h1 className="mt-8 font-black md:mt-10">
              <span className="block text-hero">
                <MaskLine>
                  <span className="text-lit">Get paid.</span>
                </MaskLine>
                <MaskLine>
                  <span className="text-ink">Don&apos;t sell.</span>
                </MaskLine>
              </span>
              <span className="mt-3 block text-[clamp(26px,3.4vw,50px)] leading-none tracking-cut">
                <MaskLine>
                  <span className="text-ghost">Borrow anyway.</span>
                </MaskLine>
              </span>
            </h1>

            <p className="reveal reveal-4 mt-9 max-w-xl text-[17px] leading-[1.65] text-muted md:text-[19px]">
              Your stock keeps paying whether you watch it or not. Osinko puts both sides of
              that to work: the dividend streams to you per second and lands weeks early, at
              the ex date, while the same position quietly backs a credit line the dividends
              themselves repay.
            </p>

            <div className="reveal reveal-5 mt-10 flex flex-wrap items-center gap-3">
              <Link ref={primary} href="/app" className="btn-primary btn-lg magnetic">
                Open the app
              </Link>
              <Link ref={secondary} href="#mechanism" className="btn-ghost btn-lg magnetic">
                See the mechanism
              </Link>
            </div>

            <div className="reveal reveal-6 mt-9 flex flex-wrap gap-2">
              <span className="pill">Self custody</span>
              <span className="pill">No lock in</span>
              <span className="pill">Contract enforced</span>
            </div>
          </div>

          {/* The object */}
          <div className="reveal reveal-3 relative min-w-0 lg:col-span-5">
            <HeroObject
              symbol={lead?.symbol ?? "AAPL"}
              price={lead?.priceUsd ?? 230.1}
              perShare={0.26}
              exDate={summary.nextDividend?.exDate}
            />
          </div>
        </div>

        {/* The proof: the protocol counter and the four numbers that define the product. */}
        <div className="reveal reveal-6 mt-20 md:mt-28">
          <div className="rule rule-draw" />
          <div className="grid gap-10 pt-9 lg:grid-cols-12 lg:gap-8">
            <div className="min-w-0 lg:col-span-4">
              <div className="eyebrow">Streaming now, protocol wide</div>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="num text-[20px] font-medium text-faint">$</span>
                <span className="figure text-[clamp(30px,4.2vw,52px)] leading-none">
                  <HeroCounter />
                </span>
              </div>
              <div className="mt-3 font-mono text-nano uppercase text-faint">
                USDG delivered to holders this quarter
              </div>
            </div>

            <div className="grid min-w-0 grid-cols-2 gap-x-6 gap-y-8 lg:col-span-8 lg:grid-cols-4">
              {RAIL.map((r) => (
                <div key={r.label} className="min-w-0 border-l border-line pl-5">
                  <div className="flex items-baseline gap-1">
                    <span className="figure text-[clamp(26px,3vw,38px)] leading-none">{r.value}</span>
                    <span className="num text-[13px] font-medium text-cyan-deep">{r.unit}</span>
                  </div>
                  <div className="mt-2.5 font-mono text-nano uppercase leading-relaxed text-faint">
                    {r.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

/**
 * The hero object: a share, annotated.
 *
 * The first black panel on the page, and the first statement of the system's one
 * inversion — chrome is paper, data is black. It tilts toward the pointer and lights
 * from wherever the cursor is, so the page's most important object is the one that
 * most obviously responds to you.
 */
function HeroObject({
  symbol,
  price,
  perShare,
  exDate,
}: {
  symbol: string;
  price: number;
  perShare: number;
  exDate?: number;
}) {
  const tiltRef = useTilt<HTMLDivElement>(3);
  const shares = 150;
  const annual = perShare * 4;

  return (
    <div className="relative mx-auto max-w-[420px] lg:mx-0 lg:max-w-none">
      <div ref={tiltRef} className="tilt">
        <div className="panel spotlight drift p-7 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[26px] font-extrabold tracking-cut text-panel-text">
                {symbol}
              </div>
              <div className="mt-1.5 font-mono text-nano uppercase text-panel-faint">
                Stock token · ERC-20 · {exDate ? `ex ${shortDate(exDate)}` : "declared"}
              </div>
            </div>
          </div>

          <div className="mt-9">
            <div className="panel-title">Position held</div>
            <div className="mt-2.5 flex items-baseline gap-2">
              <span className="figure text-[clamp(38px,5vw,54px)] leading-none">
                {fmt(shares, 4)}
              </span>
              <span className="num text-[13px] text-panel-faint">shares</span>
            </div>
            <div className="num mt-2 text-[13px] text-panel-muted">
              ${fmt(shares * price)} at ${fmt(price)}
            </div>
          </div>

          {/* The seam. Where the dividend separates from the share. */}
          <div className="my-7 flex items-center gap-3" aria-hidden>
            <div className="h-px flex-1 bg-panel-line" />
            <span className="font-mono text-nano uppercase text-panel-faint">separates at ex</span>
            <div className="h-px flex-1 bg-gradient-to-r from-cyan/70 to-transparent" />
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="min-w-0">
              <div className="panel-title">Dividend, per share</div>
              <div className="num mt-2 text-[19px] font-medium text-cyan">${fmt(perShare)}</div>
            </div>
            <div className="min-w-0">
              <div className="panel-title">Yield, annualised</div>
              <div className="num mt-2 text-[19px] font-medium text-panel-text">
                {fmt((annual / price) * 100, 2)}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Annotations, sat on the panel's own edges: they label the object without ever
          crossing its content or leaving the column. The only rounded shapes here. */}
      <span className="pill absolute -top-3.5 right-7 hidden md:inline-flex">
        the dividend · leaves
      </span>
      <span className="pill-live absolute -bottom-3.5 left-7 hidden bg-paper md:inline-flex">
        the share · stays
      </span>
    </div>
  );
}
