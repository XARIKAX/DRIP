"use client";

import { LiveCounter, StreamTicker, fmt, shortDate } from "@/components/live";
import { TokenMark } from "@/components/TokenMark";
import { ShowcaseData, useHoldings, usePortfolioSummary, useStreamRows } from "@/lib/data/provider";
import { MODE_LABEL } from "@/lib/data/types";

/**
 * The product shot, except it is the product.
 *
 * Not an image and not a mock-up: the actual dashboard components, accruing against
 * the wall clock while the page is open. Framed in a window whose chrome carries the
 * live marker, because the claim being made is that the numbers are moving — so they
 * had better be moving.
 *
 * It reads the seeded showcase store rather than the visitor's own, which is empty
 * until they do something. A landing page has to show a working account; the app has
 * to show yours.
 */
export function DashboardPreview() {
  return (
    <ShowcaseData>
      <PreviewBody />
    </ShowcaseData>
  );
}

function PreviewBody() {
  const summary = usePortfolioSummary();
  const streams = useStreamRows();
  const holdings = useHoldings();

  const open = streams.rows.filter((s) => !s.closed).slice(0, 2);
  const top = holdings.rows.slice(0, 4);

  return (
    <div className="panel">
      {/* Window chrome */}
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <div className="flex items-center gap-1.5" aria-hidden>
          <span className="block h-2 w-2 rounded-full bg-ground-3" />
          <span className="block h-2 w-2 rounded-full bg-ground-3" />
          <span className="block h-2 w-2 rounded-full bg-accent/70" />
        </div>
        <span className="font-mono text-nano uppercase tracking-widest text-faint">
          osinko · dashboard
        </span>
        <span className="flex items-center gap-2 font-mono text-nano uppercase text-accent">
          <span className="beacon" aria-hidden />
          Live
        </span>
      </div>

      <div className="p-5 md:p-6">
        {/* Headline figures */}
        <div className="grid grid-cols-2 gap-px bg-line md:grid-cols-3">
          <div className="bg-ground p-4">
            <div className="panel-title">Portfolio value</div>
            <div className="figure mt-2.5 text-[clamp(19px,2vw,26px)] leading-none">
              <LiveCounter
                base={summary.valueUsd}
                ratePerSec={summary.streamRatePerSec}
                decimals={2}
                prefix="$"
              />
            </div>
          </div>
          <div className="bg-ground p-4">
            <div className="panel-title">Earned this week</div>
            <div className="figure mt-2.5 text-[clamp(19px,2vw,26px)] leading-none text-accent">
              ${fmt(summary.earnedThisWeekUsd)}
            </div>
          </div>
          <div className="hidden bg-ground p-4 md:block">
            <div className="panel-title">Next ex date</div>
            <div className="figure mt-2.5 text-[clamp(19px,2vw,26px)] leading-none">
              {summary.nextDividend
                ? `${summary.nextDividend.symbol} · ${shortDate(summary.nextDividend.exDate)}`
                : "—"}
            </div>
          </div>
        </div>

        {/* Streams */}
        <div className="mt-5 border border-line">
          <div className="border-b border-line px-4 py-3">
            <span className="panel-title">Open streams</span>
          </div>
          {open.map((s) => {
            const pct = Math.min(
              Math.max(((Date.now() / 1000 - s.start) / (s.end - s.start)) * 100, 0),
              100
            );
            return (
              <div key={s.id} className="border-b border-line px-4 py-3.5 last:border-b-0">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <TokenMark symbol={s.symbol} size={28} dark />
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold tracking-tight text-ink">
                        {s.symbol}
                      </div>
                      <div className="font-mono text-nano uppercase text-faint">
                        {MODE_LABEL[s.mode]}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="figure text-[17px] leading-none text-accent">
                      <StreamTicker stream={s} />
                    </div>
                    <div className="num mt-1.5 text-nano uppercase text-faint">
                      of ${fmt(s.totalUsd)}
                    </div>
                  </div>
                </div>
                <div className="mt-3 h-px w-full bg-line">
                  <div
                    className="h-px bg-accent-fill transition-[width] duration-1000 ease-linear"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Holdings */}
        <div className="mt-5 hidden border border-line md:block">
          <div className="border-b border-line px-4 py-3">
            <span className="panel-title">Holdings</span>
          </div>
          {top.map((h) => (
            <div
              key={h.symbol}
              className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 border-b border-line px-4 py-3 last:border-b-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <TokenMark symbol={h.symbol} size={24} dark />
                <span className="text-[13px] font-bold tracking-tight text-ink">{h.symbol}</span>
              </div>
              <span className="num text-[12px] text-faint">{fmt(h.amount, 4)}</span>
              <span className="num text-[12px] text-ink">{h.valueUsd === null ? "—" : `$${fmt(h.valueUsd)}`}</span>
              <span className="font-mono text-nano uppercase text-accent">{MODE_LABEL[h.mode]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
