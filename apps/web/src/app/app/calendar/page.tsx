"use client";

import { useMemo, useState } from "react";
import {
  DividendStatus,
  STATUS_LABELS,
  formatDate,
  formatDuration,
  formatUsdg,
} from "@drip-markets/sdk";
import { Empty, ErrorNote, Eyebrow, Loading, SectionHead, Stat } from "@/components/ui";
import { useCalendar } from "@/lib/hooks";

type Filter = "upcoming" | "all" | "settled";

/**
 * The ex date calendar.
 *
 * This is the page people screenshot. It is a table and nothing else: ticker, amount
 * per share, ex date, pay date, and the number that matters, how many days early Drip Markets
 * pays you compared with waiting for the issuer.
 */
export default function CalendarPage() {
  const { data, isLoading, error, refetch } = useCalendar();
  const [filter, setFilter] = useState<Filter>("upcoming");

  const now = Math.floor(Date.now() / 1000);

  const rows = useMemo(() => {
    const all = [...(data ?? [])].sort((a, b) => a.exDate - b.exDate);
    if (filter === "settled") return all.filter((d) => d.status === DividendStatus.SETTLED);
    if (filter === "upcoming") return all.filter((d) => d.status === DividendStatus.DECLARED);
    return all;
  }, [data, filter]);

  const totalPerShare = rows.reduce((sum, d) => sum + d.amountPerToken, 0n);
  const avgEarly = rows.length === 0 ? 0 : Math.round(rows.reduce((s, d) => s + d.daysEarly, 0) / rows.length);

  return (
    <div className="space-y-12">
      <header className="max-w-2xl">
        <Eyebrow className="text-cyan-dark">Registry</Eyebrow>
        <h1 className="mt-3 text-display font-extrabold">Ex date calendar</h1>
        <p className="mt-5 text-[16px] leading-relaxed text-ink/80">
          Every dividend the protocol knows about. The ex date is when the money becomes yours.
          The pay date is when the issuer gets around to it. Drip Markets pays you on the first one.
        </p>
      </header>

      <div className="grid gap-px border border-ink bg-ink sm:grid-cols-3">
        <div className="bg-paper p-6">
          <Stat label="Dividends listed" value={String(rows.length)} />
        </div>
        <div className="bg-paper p-6">
          <Stat label="Total per share" value={`$${formatUsdg(totalPerShare)}`} />
        </div>
        <div className="bg-paper p-6">
          <Stat label="Average days early" value={String(avgEarly)} accent />
        </div>
      </div>

      <section className="space-y-6">
        <SectionHead
          eyebrow="Schedule"
          title="Declared dividends"
          action={
            <div className="inline-flex border border-ink">
              {(["upcoming", "settled", "all"] as Filter[]).map((f, i) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`px-3 py-2 text-micro font-bold uppercase ${i > 0 ? "border-l border-ink" : ""} ${
                    filter === f ? "bg-ink text-paper" : "bg-paper hover:bg-cyan"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          }
        />

        {isLoading ? <Loading label="Reading the registry" /> : null}
        {error ? <ErrorNote message={(error as Error).message} retry={() => void refetch()} /> : null}

        {!isLoading && !error && rows.length === 0 ? (
          <Empty
            title="Nothing declared"
            body="No dividends have been declared on this chain yet. Run the seed script to populate the calendar."
          />
        ) : null}

        {rows.length > 0 ? (
          <div className="overflow-x-auto border border-ink">
            <table className="data-table text-[14px]">
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Per share</th>
                  <th>Ex date</th>
                  <th>Pay date</th>
                  <th>Days early</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => {
                  const isEx = now >= d.exDate;
                  return (
                    <tr key={d.id.toString()}>
                      <td>
                        <span className="text-[15px] font-extrabold tracking-tight">{d.symbol}</span>
                        <span className="num ml-2 text-micro text-muted">#{d.id.toString()}</span>
                      </td>
                      <td className="num font-semibold">${formatUsdg(d.amountPerToken)}</td>
                      <td className="num">
                        {formatDate(d.exDate)}
                        <span className="ml-2 text-micro uppercase text-muted">
                          {isEx ? "ex" : `in ${formatDuration(d.exDate - now)}`}
                        </span>
                      </td>
                      <td className="num text-muted">{formatDate(d.payDate)}</td>
                      <td>
                        <span className="num text-[15px] font-extrabold text-cyan-dark">{d.daysEarly}</span>
                      </td>
                      <td>
                        <span className={d.status === DividendStatus.DECLARED ? "tag-accent" : "tag"}>
                          {STATUS_LABELS[d.status]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        <p className="text-[13px] text-muted">
          Days early is the gap between the ex date and the pay date. Wait for the issuer and you get
          paid on the right hand date. Use Drip Markets and you get paid on the left hand one, minus one percent.
        </p>
      </section>
    </div>
  );
}
