"use client";

import { LiveCounter, StreamTicker, fmt, shortDate } from "@/components/live";
import { TokenMark } from "@/components/TokenMark";
import { useHoldings, usePortfolioSummary, useStreamRows } from "@/lib/data/provider";
import { MODE_LABEL } from "@/lib/data/types";

/**
 * The product shot on the homepage. Not an image: the actual dashboard, framed,
 * running against the same demo data as /app, ticking in real time. What you see
 * is literally what you get one click later.
 */
export function DashboardPreview() {
  const summary = usePortfolioSummary();
  const streams = useStreamRows();
  const holdings = useHoldings();

  const open = streams.rows.filter((s) => !s.closed).slice(0, 2);
  const top = holdings.rows.slice(0, 3);

  return (
    <div className="border border-ink bg-paper p-2 shadow-[8px_8px_0_0_rgba(10,10,10,0.06)]">
      {/* Window chrome */}
      <div className="flex items-center justify-between border border-ink bg-wash px-4 py-2">
        <div className="flex items-center gap-1.5" aria-hidden>
          <span className="block h-2.5 w-2.5 border border-ink" />
          <span className="block h-2.5 w-2.5 border border-ink" />
          <span className="block h-2.5 w-2.5 border border-ink bg-cyan" />
        </div>
        <span className="num text-micro font-bold uppercase text-muted">dripmarkets.net/app — live demo</span>
        <span className="tag-accent">Ticking now</span>
      </div>

      <div className="border-x border-b border-ink bg-panel p-5 text-paper md:p-6">
        {/* Top strip */}
        <div className="grid grid-cols-2 gap-px bg-panel-line md:grid-cols-3">
          <div className="bg-panel p-4">
            <div className="panel-title">Portfolio value</div>
            <div className="mt-2 text-[clamp(20px,2vw,28px)] font-semibold tracking-tighter">
              <LiveCounter base={summary.valueUsd} ratePerSec={summary.streamRatePerSec} decimals={2} prefix="$" />
            </div>
          </div>
          <div className="bg-panel p-4">
            <div className="panel-title">Earned this week</div>
            <div className="num mt-2 text-[clamp(20px,2vw,28px)] font-semibold tracking-tighter text-cyan">
              ${fmt(summary.earnedThisWeekUsd)}
            </div>
          </div>
          <div className="hidden bg-panel p-4 md:block">
            <div className="panel-title">Next dividend</div>
            <div className="num mt-2 text-[clamp(20px,2vw,28px)] font-semibold tracking-tighter">
              {summary.nextDividend ? `${summary.nextDividend.symbol} · ${shortDate(summary.nextDividend.exDate)}` : "—"}
            </div>
          </div>
        </div>

        {/* Streams */}
        <div className="mt-4 border border-panel-line">
          <div className="border-b border-panel-line px-4 py-2.5">
            <span className="panel-title">Your streams</span>
          </div>
          {open.map((s) => {
            const pct = Math.min(((Date.now() / 1000 - s.start) / (s.end - s.start)) * 100, 100);
            return (
              <div key={s.id} className="border-b border-panel-line px-4 py-3 last:border-b-0">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <TokenMark symbol={s.symbol} dark size={26} />
                    <div>
                      <div className="text-[13px] font-extrabold tracking-tight">{s.symbol}</div>
                      <div className="text-micro font-bold uppercase text-panel-muted">{MODE_LABEL[s.mode]}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[18px] font-semibold tracking-tighter text-cyan">
                      <StreamTicker stream={s} />
                    </div>
                    <div className="num text-micro font-bold uppercase text-panel-faint">of ${fmt(s.totalUsd)}</div>
                  </div>
                </div>
                <div className="mt-2.5 h-1 w-full bg-panel-line">
                  <div className="h-1 bg-cyan" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Holdings */}
        <div className="mt-4 hidden border border-panel-line md:block">
          <div className="border-b border-panel-line px-4 py-2.5">
            <span className="panel-title">Holdings</span>
          </div>
          {top.map((h) => (
            <div key={h.symbol} className="flex items-center justify-between border-b border-panel-line px-4 py-2.5 last:border-b-0">
              <div className="flex items-center gap-3">
                <TokenMark symbol={h.symbol} dark size={24} />
                <span className="text-[13px] font-extrabold tracking-tight">{h.symbol}</span>
              </div>
              <span className="num text-[13px] text-panel-muted">{fmt(h.amount, 4)}</span>
              <span className="num text-[13px] font-medium">${fmt(h.valueUsd)}</span>
              <span className="text-micro font-bold uppercase text-cyan">{MODE_LABEL[h.mode]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
