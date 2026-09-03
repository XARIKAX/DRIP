"use client";

import Link from "next/link";
import { MaskLine, Reveal, useMagnetic, useTilt } from "@/components/motion";
import { EngravedBand, EngravedField, Perforation, Rosette } from "@/components/Guilloche";
import { HeroCounter } from "@/components/HeroCounter";
import { usePortfolioSummary, useTokensView } from "@/lib/data/provider";
import { fmt, shortDate } from "@/components/live";

const RAIL = [
  { value: "21", unit: "days", label: "Paid before the pay date" },
  { value: "1", unit: "sec", label: "Accrual resolution" },
  { value: "5.8", unit: "%", label: "Borrow rate, floating" },
  { value: "40", unit: "%", label: "Maximum loan to value" },
];

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/**
 * Shares written out in words, the way a certificate states them.
 *
 * The numeral is already on the document in mono; the words are the legal statement of
 * it. Two renderings of one quantity is not redundancy on an instrument like this — it
 * is the convention that makes it an instrument.
 */
function inWords(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = TENS[Math.floor(n / 10)];
    const o = n % 10;
    return o ? `${t}-${ONES[o]}` : t;
  }
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return rest ? `${ONES[h]} hundred and ${inWords(rest)}` : `${ONES[h]} hundred`;
}

/**
 * The hero.
 *
 * One argument, stated three ways: a headline that says what you get, a document that
 * shows the mechanism, and a number that proves it is already running.
 *
 * The document is the point. Osinko replaces the oldest paperwork in finance, so the
 * page opens with that paperwork — engraved, serialised, stamped, and still holding a
 * detachable dividend coupon along a perforation.
 */
export function Hero() {
  const tokens = useTokensView();
  const summary = usePortfolioSummary();
  const primary = useMagnetic<HTMLAnchorElement>(7, 140);
  const secondary = useMagnetic<HTMLAnchorElement>(5, 120);

  const lead = tokens.find((t) => t.symbol === "AAPL") ?? tokens[0];

  return (
    <section className="relative isolate overflow-hidden">
      {/* The engraved ground. Security printing, at the opacity of a watermark. */}
      <EngravedField
        width={1600}
        height={520}
        lines={54}
        amplitude={34}
        frequency={2.1}
        opacity={0.5}
        className="pointer-events-none absolute -top-12 left-0 h-[520px] w-full text-ink/[0.055]"
      />

      <Reveal className="shell relative pb-16 pt-12 md:pb-24 md:pt-16">
        {/* The issue line. Every document here is numbered. */}
        <div className="reveal flex flex-wrap items-center justify-between gap-4">
          <span className="serial">Issue No. 0001 · Series A</span>
          <span className="serial hidden sm:inline">Robinhood Chain · USDG settlement</span>
        </div>
        <div className="reveal rule-double mt-4" />

        <div className="mt-14 grid items-start gap-16 lg:grid-cols-12 lg:gap-12">
          {/* The argument */}
          <div className="min-w-0 lg:col-span-6">
            {/* Two lines at full scale; the third is a coda and is set as one — at hero
                size it wrapped, and a wrapped third line unbalances the whole spread.
                "Paid early" is the specific, ownable claim — it is the exact number the
                stat rail proves two beats later ("21 days early"), so the headline is
                not a slogan the page has to go defend, it is a claim the page backs up. */}
            <h1 className="display text-hero">
              <MaskLine>
                <span>Paid early.</span>
              </MaskLine>
              <MaskLine>
                <span className="italic">Don&apos;t sell.</span>
              </MaskLine>
            </h1>
            <div className="display-light mt-4 text-[clamp(24px,3vw,44px)] leading-none text-ghost">
              <MaskLine>
                <span className="whitespace-nowrap italic">Borrow anyway.</span>
              </MaskLine>
            </div>

            <p className="reveal reveal-4 mt-10 max-w-lg text-[17px] leading-[1.7] text-muted">
              Your stock keeps paying whether you watch it or not. Osinko puts both sides of
              that to work: the dividend streams to you per second and lands weeks early, at
              the ex date, while the same position quietly backs a credit line the dividends
              themselves repay.
            </p>

            <div className="reveal reveal-5 mt-11 flex flex-wrap items-center gap-3">
              <Link ref={primary} href="/app" className="btn-primary btn-lg magnetic">
                Open the app
              </Link>
              <Link ref={secondary} href="#mechanism" className="btn-ghost btn-lg magnetic">
                See the mechanism
              </Link>
            </div>

            <div className="reveal reveal-6 mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
              {["Self custody", "No lock in", "Contract enforced"].map((t) => (
                <span key={t} className="serial">
                  {t}
                </span>
              ))}
            </div>
          </div>

          {/* The document */}
          <div className="reveal reveal-3 min-w-0 lg:col-span-6">
            <Certificate
              symbol={lead?.symbol ?? "AAPL"}
              name={lead?.name ?? "Apple Inc"}
              price={lead?.priceUsd ?? 230.1}
              perShare={0.26}
              exDate={summary.nextDividend?.exDate}
            />
          </div>
        </div>

        {/* The proof. */}
        <div className="reveal reveal-6 mt-24 md:mt-32">
          <div className="rule-double" />
          <div className="grid gap-12 pt-10 lg:grid-cols-12 lg:gap-8">
            <div className="min-w-0 lg:col-span-4">
              <div className="serial">Streaming now, protocol wide</div>
              <div className="mt-5 flex items-baseline gap-2">
                <span className="num text-[19px] font-medium text-faint">$</span>
                <span className="figure text-[clamp(30px,4.2vw,50px)] leading-none">
                  <HeroCounter />
                </span>
              </div>
              <div className="mt-3 text-[13px] text-muted">
                USDG delivered to holders this quarter
              </div>
            </div>

            <div className="grid min-w-0 grid-cols-2 gap-x-8 gap-y-9 lg:col-span-8 lg:grid-cols-4">
              {RAIL.map((r) => (
                <div key={r.label} className="min-w-0 border-l border-line pl-5">
                  <div className="flex items-baseline gap-1">
                    <span className="figure text-[clamp(26px,3vw,38px)] leading-none">{r.value}</span>
                    <span className="num text-[13px] font-medium text-cyan-deep">{r.unit}</span>
                  </div>
                  <div className="mt-3 text-[12px] leading-snug text-faint">{r.label}</div>
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
 * The certificate.
 *
 * Engraved border, corner ornaments, a rose-engine watermark turning behind the
 * quantity, the shares stated in both words and numerals, an inked ex-date stamp, and
 * a dividend coupon still attached along its perforation. Everything the product does
 * to a dividend, this object states in the language of the document it replaces.
 */
function Certificate({
  symbol,
  name,
  price,
  perShare,
  exDate,
}: {
  symbol: string;
  name: string;
  price: number;
  perShare: number;
  exDate?: number;
}) {
  const tiltRef = useTilt<HTMLDivElement>(2.5);
  const shares = 150;
  const coupon = shares * perShare;

  return (
    <div ref={tiltRef} className="tilt mx-auto max-w-[520px] lg:mx-0 lg:max-w-none">
      <div className="certificate overflow-hidden">
        {/* Engraved bands at head and foot. Unambiguously printing, unlike a rosette
            cropped into a corner, which at watermark opacity reads as a scuff. */}
        <EngravedBand height={22} className="absolute inset-x-0 top-0 h-[22px] w-full text-ink/25" />
        <EngravedBand
          height={22}
          flip
          className="absolute inset-x-0 bottom-0 h-[22px] w-full text-ink/25"
        />

        {/* The rose engine turns behind the number, clipped by the sheet — closer and
            brighter than a background watermark should be, because this is the one
            ornament on the page allowed to compete for attention with the type. */}
        <div
          className="pointer-events-none absolute -right-8 top-20 text-ink/[0.24]"
          aria-hidden
        >
          <Rosette size={330} rings={36} R={100} r={28} a={68} drift={0.78} spin={90} />
        </div>

        <div className="relative px-8 py-11 md:px-10 md:py-12">
          {/* Masthead */}
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="display text-[19px] leading-none">Osinko</div>
              <div className="serial mt-2">Share certificate</div>
            </div>
            <div className="text-right">
              <div className="serial">No.</div>
              <div className="num mt-1.5 text-[13px] font-medium text-ink">000150</div>
            </div>
          </div>

          <div className="rule-double mt-5" />

          {/* The holding, stated the way a document states it. */}
          <div className="relative mt-7">
            <div className="serial">This certifies the holding of</div>
            {/* The one number on the page allowed to shimmer. A foil strip, not a
                gradient: the base glyphs stay solid ink, embossed with a hairline of
                light on top and shadow beneath, and a specular band sweeps across them
                the way a hologram catches the light as a certificate tilts. */}
            <div
              className="foil-text display mt-3.5 text-[clamp(36px,4.6vw,52px)] leading-[1]"
              style={{ textShadow: "0 1px 0 rgba(255,255,255,0.7), 0 -1px 0 rgba(10,10,10,0.14)" }}
              data-text={inWords(shares)}
            >
              {inWords(shares)}
            </div>
            <div className="display-light mt-1 text-[20px] italic text-muted">
              shares of {name}
            </div>

            <div className="mt-6 grid grid-cols-3 gap-4 border-t border-line-soft pt-5">
              <div className="min-w-0">
                <div className="serial">Quantity</div>
                <div className="figure mt-2 text-[22px] leading-none">{fmt(shares, 4)}</div>
              </div>
              <div className="min-w-0">
                <div className="serial">Ticker</div>
                <div className="mt-2 text-[20px] font-bold leading-none tracking-tight">
                  {symbol}
                </div>
              </div>
              <div className="min-w-0">
                <div className="serial">Value</div>
                <div className="figure mt-2 text-[22px] leading-none">
                  ${fmt(shares * price, 0)}
                </div>
              </div>
            </div>
          </div>

          {/* The perforation, and the coupon still attached to it. */}
          <Perforation className="mt-7 text-ink/45" label="detach at ex date" />

          <div className="mt-6 flex flex-wrap items-end justify-between gap-5">
            <div className="min-w-0">
              <div className="serial">Dividend coupon</div>
              <div className="mt-2.5 flex items-baseline gap-2.5">
                <span className="figure text-[28px] leading-none text-cyan-deep">
                  ${fmt(coupon, 2)}
                </span>
                <span className="num text-[12px] text-faint">
                  ${fmt(perShare)} × {fmt(shares, 0)}
                </span>
              </div>
            </div>

            <span className="stamp stamp-in shrink-0">
              {exDate ? `Ex ${shortDate(exDate)}` : "Declared"}
            </span>
          </div>
        </div>
      </div>

      {/* The countersignature line: the last thing on a real certificate. */}
      <div className="mt-4 flex items-center justify-between gap-6 px-1">
        <span className="serial">Countersigned · onchain</span>
        <span className="serial">Non-transferable custody · self held</span>
      </div>
    </div>
  );
}
