"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { fmt, relativeTime, shortDate } from "@/components/live";
import { TokenMark } from "@/components/TokenMark";
import { useCalendarRows, useHoldings } from "@/lib/data/provider";
import type { DividendRow } from "@/lib/data/types";

type Filter = "all" | "week" | "month" | "mine";
type View = "table" | "month";

/**
 * The screenshotable asset. A table where one column is the product: the days you
 * get paid early, in the accent. Filters, a month grid, and a set-a-rule shortcut on hover.
 */
export default function CalendarPage() {
  const { rows } = useCalendarRows();
  const holdings = useHoldings();
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<View>("table");

  const held = useMemo(() => new Set(holdings.rows.map((h) => h.symbol)), [holdings.rows]);
  const now = Math.floor(Date.now() / 1000);

  const filtered = useMemo(() => {
    const upcoming = rows.filter((d) => d.status === "DECLARED");
    switch (filter) {
      case "week":
        return upcoming.filter((d) => d.exDate >= now - 86_400 && d.exDate <= now + 7 * 86_400);
      case "month":
        return upcoming.filter((d) => d.exDate >= now - 86_400 && d.exDate <= now + 31 * 86_400);
      case "mine":
        return upcoming.filter((d) => held.has(d.symbol));
      default:
        return upcoming;
    }
  }, [rows, filter, held, now]);

  const totalPerShare = filtered.reduce((s, d) => s + d.perShare, 0);
  const avgEarly = filtered.length ? Math.round(filtered.reduce((s, d) => s + d.daysEarly, 0) / filtered.length) : 0;

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: "All upcoming" },
    { key: "week", label: "This week" },
    { key: "month", label: "This month" },
    { key: "mine", label: "My stocks" },
  ];

  return (
    <div className="rise-group space-y-10">
      <header className="max-w-2xl border-b border-line pb-8">
        <div className="serial">Payout calendar</div>
        <h1 className="mt-4 display text-display">Payout dates</h1>
        <p className="mt-5 text-[16px] leading-relaxed text-muted">
          The ex date is the day you must own a stock to get its next dividend. The pay date is
          when the company actually sends the money, usually three weeks later. Osinko pays you
          on the first one.
        </p>
      </header>

      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line">
        {[
          { label: "Dividends coming up", value: String(filtered.length) },
          { label: "Added up, per share", value: `$${fmt(totalPerShare)}` },
          { label: "Days early, on average", value: String(avgEarly), accent: true },
        ].map((s) => (
          <div key={s.label} className="bg-paper p-5">
            <div className="eyebrow text-muted">{s.label}</div>
            <div className={`num mt-2 text-3xl font-semibold tracking-tighter ${s.accent ? "text-accent" : ""}`}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <section className="space-y-5" aria-label="Declared dividends" data-shot="calendar">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full border px-3.5 py-1.5 text-micro font-bold uppercase transition-colors ${
                  filter === f.key
                    ? "border-transparent bg-accent-fill text-accent-ink"
                    : "border-line text-muted hover:text-ink"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="inline-flex overflow-hidden rounded-full border border-line p-0.5" role="group" aria-label="View">
            {(["table", "month"] as View[]).map((v, i) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`rounded-full px-3.5 py-1.5 text-micro font-bold uppercase transition-colors ${
                  view === v ? "bg-accent-fill text-accent-ink" : "bg-transparent text-muted hover:text-ink"
                }`}
              >
                {v === "table" ? "Table" : "Month"}
              </button>
            ))}
          </div>
        </div>

        {view === "table" ? <CalendarTable rows={filtered} held={held} /> : <MonthGrid rows={filtered} />}

        <p className="text-[13px] text-muted">
          “Paid early by” is the gap between the two dates. Wait for the company and you get paid on
          the pay date. Use Osinko and you get paid on the ex date, minus 1%.
        </p>
      </section>
    </div>
  );
}

function CalendarTable({ rows, held }: { rows: DividendRow[]; held: Set<string> }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-ground-2 px-6 py-12 text-center">
        <p className="text-[15px] font-bold">Nothing in this range</p>
        <p className="mt-1 text-[13px] text-muted">Try a wider one.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto border border-line">
      <table className="data-table min-w-[760px] text-[14px]">
        <thead>
          <tr>
            <th>Stock</th>
            <th>Per share</th>
            <th>Ex date</th>
            <th>Pay date</th>
            <th className="text-accent">Paid early by</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id} className="group transition-colors hover:bg-ground-2">
              <td>
                <div className="flex items-center gap-3">
                  <TokenMark symbol={d.symbol} size={28} />
                  <span className="text-[15px] font-extrabold tracking-tight">{d.symbol}</span>
                  {held.has(d.symbol) ? <span className="tag-accent">Held</span> : null}
                </div>
              </td>
              <td className="num font-semibold">${fmt(d.perShare)}</td>
              <td className="num">
                {shortDate(d.exDate)}
                <span className="ml-2 text-micro font-bold uppercase text-muted">{relativeTime(d.exDate)}</span>
              </td>
              <td className="num text-muted">{shortDate(d.payDate)}</td>
              <td>
                <span className="num text-[17px] font-extrabold text-accent">{d.daysEarly} days</span>
              </td>
              <td className="text-right">
                <Link
                  href="/app"
                  className="btn-ghost btn-sm opacity-0 transition-opacity duration-150 focus:opacity-100 group-hover:opacity-100"
                >
                  Set a rule
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A month of squares; ex dates land as accent blocks. */
function MonthGrid({ rows }: { rows: DividendRow[] }) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadBlanks = (first.getDay() + 6) % 7; // Monday first

  const byDay = new Map<number, DividendRow[]>();
  for (const d of rows) {
    const dt = new Date(d.exDate * 1000);
    if (dt.getFullYear() === year && dt.getMonth() === month) {
      const list = byDay.get(dt.getDate()) ?? [];
      list.push(d);
      byDay.set(dt.getDate(), list);
    }
  }

  const monthName = today.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="border border-line">
      <div className="flex items-baseline justify-between border-b border-line px-4 py-3">
        <span className="text-[15px] font-extrabold tracking-tight">{monthName}</span>
        <span className="text-micro font-bold uppercase text-muted">Ex dates this month</span>
      </div>
      <div className="grid grid-cols-7 gap-px bg-ground-3 p-px">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="bg-paper px-2 py-1.5 text-center text-micro font-bold uppercase text-muted">
            {d}
          </div>
        ))}
        {Array.from({ length: leadBlanks }).map((_, i) => (
          <div key={`b${i}`} className="min-h-[72px] bg-ground-2" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const events = byDay.get(day) ?? [];
          const isToday = day === today.getDate();
          return (
            <div key={day} className={`min-h-[72px] bg-ground p-1.5 ${isToday ? "outline outline-1 outline-accent" : ""}`}>
              <div className={`num text-[11px] ${isToday ? "font-bold text-accent" : "text-muted"}`}>{day}</div>
              <div className="mt-1 space-y-1">
                {events.map((e) => (
                  <div key={e.id} className="rounded-sm bg-iris-100 px-1.5 py-0.5 text-[11px] font-bold tracking-tight text-iris-900">
                    {e.symbol} <span className="num">${fmt(e.perShare)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
