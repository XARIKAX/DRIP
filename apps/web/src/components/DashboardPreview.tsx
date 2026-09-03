"use client";

import { LiveCounter, StreamTicker, fmt, shortDate } from "@/components/live";
import { TokenMark } from "@/components/TokenMark";
import { useHoldings, usePortfolioSummary, useStreamRows } from "@/lib/data/provider";
import { MODE_LABEL } from "@/lib/data/types";

/**
 * The product shot, except it is the product.
 *
 * Not an image and not a mock-up: the actual dashboard components, bound to the same
 * demo store as /app, accruing against the wall clock while the page is open. Framed
 * in a window whose chrome carries the live marker, because the claim being made is
 * that the numbers are moving — so they had better be moving.
 */
export function DashboardPreview() {
  const summary = usePortfolioSummary();
  const streams = useStreamRows();
  const holdings = useHoldings();

  const open = streams.rows.filter((s) => !s.closed).slice(0, 2);
  const top = holdings.rows.slice(0, 4);

  return (
    <div className="float">
      {/* Window chrome */}
      <div className="flex items-center justify-between border-b border-line-soft px-5 py-3.5">
        <div className="flex items-center gap-1.5" aria-hidden>
          <span className="block h-2 w-2 rounded-full bg-surface-4" />
          <span className="block h-2 w-2 rounded-full bg-surface-4" />
          <span className="block h-2 w-2 rounded-full bg-cyan/70" />
        </div>
        <span className="font-mono text-nano uppercase tracking-widest text-ghost">
          osinko · dashboard
        </span>
        <span className="flex items-center gap-2 font-mono text-nano uppercase text-cyan">
          <span className="beacon" aria-hidden />
          Live
        </span>
      </div>

      <div className="p-5 md:p-6">
        {/* Headline figures */}
        <div className="grid grid-cols-2 gap-px bg-line-soft md:grid-cols-3">
          <div className="bg-surface p-4">
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
          <div className="bg-surface p-4">
            <div className="panel-title">Earned this week</div>
            <div className="figure mt-2.5 text-[clamp(19px,2vw,26px)] leading-none text-cyan">
              ${fmt(summary.earnedThisWeekUsd)}
            </div>
          </div>
          <div className="hidden bg-surface p-4 md:block">
            <div className="panel-title">Next ex date</div>
            <div className="figure mt-2.5 text-[clamp(19px,2vw,26px)] leading-none">
              {summary.nextDividend
                ? `${summary.nextDividend.symbol} · ${shortDate(summary.nextDividend.exDate)}`
                : "—"}
            </div>
          </div>
        </div>

        {/* Streams */}
        <div className="mt-5 border border-line-soft">
          <div className="border-b border-line-soft px-4 py-3">
            <span className="panel-title">Open streams</span>
          </div>
          {open.map((s) => {
            const pct = Math.min(
              Math.max(((Date.now() / 1000 - s.start) / (s.end - s.start)) * 100, 0),
              100
            );
            return (
              <div key={s.id} className="border-b border-line-soft px-4 py-3.5 last:border-b-0">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <TokenMark symbol={s.symbol} size={28} />
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold tracking-tight text-chalk">
                        {s.symbol}
                      </div>
                      <div className="font-mono text-nano uppercase text-ghost">
                        {MODE_LABEL[s.mode]}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="figure text-[17px] leading-none text-cyan">
                      <StreamTicker stream={s} />
                    </div>
                    <div className="num mt-1.5 text-nano uppercase text-ghost">
                      of ${fmt(s.totalUsd)}
                    </div>
                  </div>
                </div>
                <div className="mt-3 h-px w-full bg-line-soft">
                  <div
                    className="h-px bg-cyan transition-[width] duration-1000 ease-linear"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Holdings */}
        <div className="mt-5 hidden border border-line-soft md:block">
          <div className="border-b border-line-soft px-4 py-3">
            <span className="panel-title">Holdings</span>
          </div>
          {top.map((h) => (
            <div
              key={h.symbol}
              className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 border-b border-line-soft px-4 py-3 last:border-b-0"
            >
              <div className="flex min-w-0 items-center gap-3">
                <TokenMark symbol={h.symbol} size={24} />
                <span className="text-[13px] font-bold tracking-tight text-chalk">{h.symbol}</span>
              </div>
              <span className="num text-[12px] text-faint">{fmt(h.amount, 4)}</span>
              <span className="num text-[12px] text-chalk">${fmt(h.valueUsd)}</span>
              <span className="font-mono text-nano uppercase text-cyan">{MODE_LABEL[h.mode]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
