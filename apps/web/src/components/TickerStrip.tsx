"use client";

import { useCalendarRows, useTokensView } from "@/lib/data/provider";
import { fmt, shortDate } from "@/components/live";

/**
 * The dividend tape.
 *
 * Every declared dividend in the universe, in ex-date order, running continuously.
 * It pauses when hovered so a reader can actually read it, and it fades at both edges
 * rather than being cut by a border — the tape should feel like it continues past the
 * screen, because it does. Same data source as the calendar, so the numbers agree.
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
      yield: priceOf.get(d.symbol) ? ((d.perShare * 4) / priceOf.get(d.symbol)!) * 100 : null,
    }));

  if (cells.length === 0) return null;
  const doubled = [...cells, ...cells];

  return (
    <div
      className="marquee-host relative overflow-hidden border-y border-line-soft bg-void-deep"
      aria-hidden
    >
      <div className="flex w-max marquee">
        {doubled.map((cell, i) => (
          <div key={`${cell.symbol}-${i}`} className="ticker-cell border-r border-line-soft">
            <span className="text-[12px] font-bold tracking-tight text-chalk">{cell.symbol}</span>
            <span className="num text-[12px] font-medium text-cyan">${cell.amount}</span>
            <span className="font-mono text-nano font-medium uppercase text-ghost">EX {cell.note}</span>
          </div>
        ))}
      </div>

      {/* The tape runs out of the frame rather than stopping at it. */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-void-deep to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-void-deep to-transparent"
        aria-hidden
      />
    </div>
  );
}
