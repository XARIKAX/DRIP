"use client";

import Link from "next/link";
import { Reveal } from "@/components/motion";
import { TokenMark } from "@/components/TokenMark";
import { fmt, shortDate } from "@/components/live";
import { useTokensView } from "@/lib/data/provider";

/**
 * The universe.
 *
 * The one place on the page where density is the point. A landing page that only ever
 * shows three round-numbered stats is hiding the fact that it has no data; a table of
 * every listed name, priced and dated, is the proof. It is also the surface where the
 * listing rules can be stated plainly, which is the part an institution actually reads.
 */
export function Universe() {
  const tokens = useTokensView();
  const listed = [...tokens].sort((a, b) => b.yieldPct - a.yieldPct);
  const paying = listed.filter((t) => t.payingNow).length;

  return (
    <section className="relative border-t border-line-soft py-band">
      <Reveal className="shell">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <div className="reveal eyebrow">The universe</div>
            <h2 className="reveal reveal-1 mt-5 text-display font-black tracking-cut text-lit">
              {listed.length} names, priced by Chainlink
            </h2>
          </div>
          <p className="reveal reveal-2 max-w-sm text-[15px] leading-relaxed text-dim">
            Every listed token carries its own price feed and its own route. A name without
            a feed is not listed — there is no manual price anywhere in this system.
          </p>
        </div>

        <div className="reveal reveal-2 mt-14 border border-line-soft bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-5 py-3.5">
            <span className="panel-title">Listed stock tokens</span>
            <span className="flex items-center gap-2 font-mono text-nano uppercase text-cyan">
              <span className="beacon" aria-hidden />
              {paying} paying now
            </span>
          </div>

          <div className="overflow-x-auto dark-scroll">
            <table className="panel-table min-w-[720px] text-[13px]">
              <thead>
                <tr>
                  <th>Token</th>
                  <th className="text-right">Price</th>
                  <th className="text-right">Dividend</th>
                  <th className="text-right">Yield</th>
                  <th className="text-right">Next ex</th>
                  <th className="text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {listed.map((t) => (
                  <tr key={t.symbol}>
                    <td>
                      <div className="flex items-center gap-3">
                        <TokenMark symbol={t.symbol} size={26} />
                        <div className="min-w-0">
                          <div className="font-bold tracking-tight text-chalk">{t.symbol}</div>
                          <div className="truncate font-mono text-nano uppercase text-ghost">
                            {t.name}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="num text-right text-chalk">${fmt(t.priceUsd)}</td>
                    <td className="num text-right text-dim">
                      {t.perShare > 0 ? `$${fmt(t.perShare)}` : "—"}
                    </td>
                    <td className="num text-right text-cyan">
                      {t.yieldPct > 0 ? `${fmt(t.yieldPct, 2)}%` : "—"}
                    </td>
                    <td className="num text-right text-dim">
                      {t.nextExDate ? shortDate(t.nextExDate) : "—"}
                    </td>
                    <td className="text-right">
                      <span
                        className={`font-mono text-nano uppercase ${
                          t.payingNow ? "text-cyan" : t.perShare > 0 ? "text-faint" : "text-ghost"
                        }`}
                      >
                        {t.payingNow ? "Streaming" : t.perShare > 0 ? "Declared" : "No dividend"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* The listing rules. Operational rigour, stated rather than implied. */}
        <div className="reveal reveal-3 mt-6 grid gap-px border border-line-soft bg-line-soft md:grid-cols-3">
          {[
            {
              rule: "No feed, no listing",
              body: "A token without a Chainlink price feed on this chain is never added to the universe, whatever its volume.",
            },
            {
              rule: "Fail closed on stale",
              body: "A feed older than its one hour heartbeat, or reporting a zero, halts pricing for that name rather than guessing.",
            },
            {
              rule: "Bounded by the oracle",
              body: "Every swap quotes on chain and every minimum output is bounded against the feed, so a bad route reverts.",
            },
          ].map((r) => (
            <div key={r.rule} className="bg-surface p-6">
              <div className="font-mono text-nano uppercase text-cyan">{r.rule}</div>
              <p className="mt-3 text-[13px] leading-relaxed text-dim">{r.body}</p>
            </div>
          ))}
        </div>

        <div className="reveal reveal-4 mt-10">
          <Link href="/app/calendar" className="btn-quiet">
            Open the full calendar
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
