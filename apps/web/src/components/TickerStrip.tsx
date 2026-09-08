"use client";

import { useCalendarRows, useTokensView } from "@/lib/data/provider";
import { fmt, shortDate } from "@/components/live";
import { Koi } from "@/components/pixel/Scenery";

/**
 * The dividend tape.
 *
 * Every declared dividend in the universe, in ex-date order, running continuously.
 * A koi leads each entry — a payment moving through the garden, and the one place in
 * the chrome where the pixel language does something rather than decorating. The tape
 * pauses on hover so a reader can actually read it, and it draws on the same source as
 * the calendar, so the numbers here agree with the numbers there.
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
      className="marquee-host night relative overflow-hidden bg-ground [--cell:2px]"
      aria-hidden
    >
      <div className="flex w-max marquee">
        {doubled.map((cell, i) => (
          <div key={`${cell.symbol}-${i}`} className="ticker-cell gap-3">
            <Koi cell="calc(var(--cell) * 0.8)" className="opacity-80" />
            <span className="text-[12px] font-bold tracking-tight text-ink">{cell.symbol}</span>
            <span className="num text-[12px] font-medium text-accent">${cell.amount}</span>
            <span className="font-mono text-nano font-medium uppercase text-faint">
              EX {cell.note}
            </span>
          </div>
        ))}
      </div>

      {/* The tape runs out of the frame rather than stopping at it. */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-ground to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-ground to-transparent"
        aria-hidden
      />
      {/* The bed the stream runs over. */}
      <div className="rule-sand pointer-events-none absolute inset-x-0 bottom-0 opacity-60" aria-hidden />
    </div>
  );
}
