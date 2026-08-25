"use client";

import { useCalendarRows, useTokensView } from "@/lib/data/provider";
import { fmt, shortDate } from "@/components/live";

/**
 * The boxed ticker strip. Cyan left edge on every cell, mono numbers, marquee that
 * pauses when you hover it. Reads the same data source as every other surface, so
 * the numbers here agree with the calendar and the dashboard.
 */
export function TickerStrip() {
  const { rows } = useCalendarRows();
  const tokens = useTokensView();

  const priceOf = new Map(tokens.map((t) => [t.symbol, t.priceUsd]));
  const cells = rows
    .filter((d) => d.status === "DECLARED")
    .sort((a, b) => a.exDate - b.exDate)
    .slice(0, 8)
    .map((d) => ({
      symbol: d.symbol,
      amount: fmt(d.perShare, 2),
      note: `Ex ${shortDate(d.exDate)}`,
      price: priceOf.get(d.symbol),
    }));

  if (cells.length === 0) return null;
  const doubled = [...cells, ...cells];

  return (
    <div className="marquee-host rule-b overflow-hidden bg-paper" aria-hidden>
      <div className="flex w-max marquee">
        {doubled.map((cell, i) => (
          <div key={`${cell.symbol}-${i}`} className="ticker-cell">
            <span className="text-[13px] font-extrabold tracking-tight">{cell.symbol}</span>
            <span className="num text-[13px] font-semibold text-cyan-dark">${cell.amount}</span>
            <span className="text-micro font-bold uppercase text-muted">{cell.note}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
