"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Reveal, usePointerGlow } from "@/components/motion";
import { Folio } from "@/components/site/Folio";
import { TokenMark } from "@/components/TokenMark";
import { fmt, shortDate } from "@/components/live";
import { useTokensView } from "@/lib/data/provider";
import type { TokenInfo } from "@/lib/data/types";

type SortKey = "symbol" | "priceUsd" | "perShare" | "yieldPct" | "nextExDate";
type Filter = "all" | "paying" | "declared" | "none";

const COLUMNS: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "symbol", label: "Token", align: "left" },
  { key: "priceUsd", label: "Price", align: "right" },
  { key: "perShare", label: "Dividend", align: "right" },
  { key: "yieldPct", label: "Yield", align: "right" },
  { key: "nextExDate", label: "Next ex", align: "right" },
];

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "paying", label: "Streaming" },
  { key: "declared", label: "Declared" },
  { key: "none", label: "No dividend" },
];

/**
 * The universe.
 *
 * The one place on the page where density is the point. A landing page that only ever
 * shows three round-numbered stats is hiding the fact that it has no data; a table of
 * every listed name — sortable, filterable, priced — is the proof. It runs on black
 * because it is data, and it is the section where the listing rules get stated plainly,
 * which is the part an institution actually reads.
 */
export function Universe() {
  const tokens = useTokensView();
  const glow = usePointerGlow<HTMLDivElement>();
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "yieldPct", desc: true });
  const [filter, setFilter] = useState<Filter>("all");

  const rows = useMemo(() => {
    const matches = (t: TokenInfo) =>
      filter === "all"
        ? true
        : filter === "paying"
          ? t.payingNow
          : filter === "declared"
            ? !t.payingNow && t.perShare > 0
            : t.perShare === 0;

    const value = (t: TokenInfo, key: SortKey): number | string => {
      if (key === "symbol") return t.symbol;
      // A name with no scheduled ex date sorts last in either direction rather than
      // pretending to be at the epoch.
      if (key === "nextExDate") return t.nextExDate ?? Number.MAX_SAFE_INTEGER;
      return t[key];
    };

    return tokens.filter(matches).sort((a, b) => {
      const av = value(a, sort.key);
      const bv = value(b, sort.key);
      const cmp =
        typeof av === "string" && typeof bv === "string" ? av.localeCompare(bv) : Number(av) - Number(bv);
      return sort.desc ? -cmp : cmp;
    });
  }, [tokens, sort, filter]);

  const paying = tokens.filter((t) => t.payingNow).length;

  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "symbol" }));

  return (
    <section id="universe" className="relative py-band">
      <Reveal className="shell">
        <Folio serial="The universe" index={4} />
        <div className="mt-12 flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <h2 className="reveal reveal-1 display text-display">
              {tokens.length} names, priced by Chainlink
            </h2>
          </div>
          <p className="reveal reveal-2 max-w-sm text-[15px] leading-relaxed text-muted">
            Every listed token carries its own price feed and its own route. A name without a
            feed is not listed — there is no manual price anywhere in this system.
          </p>
        </div>

        <div ref={glow} className="reveal reveal-2 panel-frame spotlight mt-14">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-panel-line px-5 py-4">
            <div className="seg-dark">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={filter === f.key}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <span className="flex items-center gap-2 font-mono text-nano uppercase text-cyan">
              <span className="beacon" aria-hidden />
              {paying} streaming now
            </span>
          </div>

          <div className="overflow-x-auto dark-scroll">
            <table className="panel-table min-w-[760px] text-[13px]">
              <thead>
                <tr>
                  {COLUMNS.map((c) => {
                    const on = sort.key === c.key;
                    return (
                      <th
                        key={c.key}
                        aria-sort={on ? (sort.desc ? "descending" : "ascending") : "none"}
                        className={c.align === "right" ? "text-right" : ""}
                      >
                        <button
                          type="button"
                          onClick={() => toggle(c.key)}
                          className={`th-sort inline-flex items-center gap-1.5 uppercase ${
                            c.align === "right" ? "flex-row-reverse" : ""
                          } ${on ? "text-panel-text" : ""}`}
                        >
                          {c.label}
                          <span
                            className={`transition-opacity duration-200 ${
                              on ? "text-cyan opacity-100" : "opacity-0"
                            }`}
                            aria-hidden
                          >
                            {sort.desc ? "↓" : "↑"}
                          </span>
                        </button>
                      </th>
                    );
                  })}
                  <th className="text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.symbol}>
                    <td>
                      <div className="flex items-center gap-3">
                        <TokenMark symbol={t.symbol} size={26} />
                        <div className="min-w-0">
                          <div className="font-bold tracking-tight text-panel-text">{t.symbol}</div>
                          <div className="truncate font-mono text-nano uppercase text-panel-faint">
                            {t.name}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="num text-right text-panel-text">${fmt(t.priceUsd)}</td>
                    <td className="num text-right text-panel-muted">
                      {t.perShare > 0 ? `$${fmt(t.perShare)}` : "—"}
                    </td>
                    <td className="num text-right text-cyan">
                      {t.yieldPct > 0 ? `${fmt(t.yieldPct, 2)}%` : "—"}
                    </td>
                    <td className="num text-right text-panel-muted">
                      {t.nextExDate ? shortDate(t.nextExDate) : "—"}
                    </td>
                    <td className="text-right">
                      <span
                        className={`font-mono text-nano uppercase ${
                          t.payingNow
                            ? "text-cyan"
                            : t.perShare > 0
                              ? "text-panel-muted"
                              : "text-panel-faint"
                        }`}
                      >
                        {t.payingNow ? "Streaming" : t.perShare > 0 ? "Declared" : "No dividend"}
                      </span>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-panel-faint">
                      Nothing matches that filter.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        {/* The listing rules. Operational rigour, stated rather than implied. */}
        <div className="reveal reveal-3 mt-6 grid gap-px border border-line bg-line md:grid-cols-3">
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
            <div key={r.rule} className="bg-paper p-6">
              <div className="font-mono text-nano uppercase text-cyan-deep">{r.rule}</div>
              <p className="mt-3 text-[13px] leading-relaxed text-muted">{r.body}</p>
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
