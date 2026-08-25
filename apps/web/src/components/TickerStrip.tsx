"use client";

import { useCalendar, useStockTokens } from "@/lib/hooks";
import { DividendStatus, formatDate, formatUsdg } from "@drip-markets/sdk";

/**
 * The boxed ticker strip. Cyan left edge on every cell, mono numbers, marquee that
 * pauses when you hover it.
 *
 * Live declarations when the chain has them, a static reference row when it does not,
 * so the page is never a row of empty boxes.
 */

const FALLBACK = [
  { symbol: "AAPL", amount: "0.26", note: "Ex Aug 11" },
  { symbol: "MSFT", amount: "0.83", note: "Ex Aug 21" },
  { symbol: "KO", amount: "0.51", note: "Ex Sep 15" },
  { symbol: "JNJ", amount: "1.30", note: "Ex Aug 26" },
  { symbol: "NVDA", amount: "0.01", note: "Ex Sep 08" },
  { symbol: "PG", amount: "1.06", note: "Ex Oct 24" },
];

export function TickerStrip() {
  const { data: calendar } = useCalendar();
  const { data: tokens } = useStockTokens();

  const live =
    calendar
      ?.filter((d) => d.status !== DividendStatus.VOIDED)
      .slice(-8)
      .map((d) => ({
        symbol: d.symbol || tokens?.find((t) => t.address === d.stockToken)?.symbol || "TOKEN",
        amount: formatUsdg(d.amountPerToken, 2),
        note: `Ex ${formatDate(d.exDate)}`,
      })) ?? [];

  const cells = live.length > 0 ? live : FALLBACK;
  const doubled = [...cells, ...cells];

  return (
    <div className="marquee-host rule-b overflow-hidden bg-paper">
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
