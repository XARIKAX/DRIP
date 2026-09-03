"use client";

import { useCalendarRows, useTokensView } from "@/lib/data/provider";
import { fmt, shortDate } from "@/components/live";

/**
 * The dividend tape.
 *
 * Every declared dividend in the universe, in ex-date order, running continuously.
 * Each cell carries a cyan left edge — the only ornament in the chrome — and the tape
 * pauses on hover so a reader can actually read it. Same data source as the calendar,
 * so the numbers here agree with the numbers there.
 */
export function TickerStrip() {
  const { rows } = useCalendarRows();
  const tokens = useTokensView();

  const priceOf = new Map(tokens.map((t) => [t.symbol, t.priceUsd]));
  const cells = rows
    .filter((d) => d.status === "DECLARED")
    .sort((a, b) => a.exDate - b.exDate)
    .slice(0, 10)
    .map((d) => ({
      symbol: d.symbol,
      amount: fmt(d.perShare, 2),
      note: shortDate(d.exDate),
      price: priceOf.get(d.symbol),
    }));

  if (cells.length === 0) return null;
  const doubled = [...cells, ...cells];

  return (
    <div
      className="marquee-host relative overflow-hidden border-b border-line bg-paper-2"
      aria-hidden
    >
      <div className="flex w-max marquee">
        {doubled.map((cell, i) => (
          <div key={`${cell.symbol}-${i}`} className="ticker-cell border-l-2 border-cyan">
            <span className="text-[12px] font-bold tracking-tight text-ink">{cell.symbol}</span>
            <span className="num text-[12px] font-medium text-cyan-deep">${cell.amount}</span>
            <span className="font-mono text-nano font-medium uppercase text-faint">
              EX {cell.note}
            </span>
          </div>
        ))}
      </div>

      {/* The tape runs out of the frame rather than stopping at it. */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-paper-2 to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-paper-2 to-transparent"
        aria-hidden
      />
    </div>
  );
}
