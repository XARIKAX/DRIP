"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AnimatedNumber, Countdown, LiveCounter, StreamTicker, fmt, relativeTime, shortDate } from "@/components/live";
import { Sparkline } from "@/components/charts";
import { TokenMark } from "@/components/TokenMark";
import {
  useActivityRows,
  useDataActions,
  useHoldings,
  usePendingAdvances,
  usePortfolioSummary,
  useStreamRows,
} from "@/lib/data/provider";
import { MODE_LABEL, streamClaimable, type ModeName, type StreamRow } from "@/lib/data/types";

const MODES: ModeName[] = ["CASH_EARLY", "STREAM", "REINVEST"];

export default function DashboardPage() {
  return (
    <div className="rise-group space-y-8">
      <Header />
      <TopStrip />
      <div className="grid gap-8 xl:grid-cols-3">
        <div className="min-w-0 space-y-8 xl:col-span-2">
          <PendingAdvances />
          <StreamsPanel />
          <HoldingsPanel />
        </div>
        <ActivityFeed />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Header() {
  return (
    <header className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-8">
      <div className="min-w-0">
        <div className="serial">Dashboard</div>
        <h1 className="mt-4 display text-display">
          Your dividends, live
        </h1>
      </div>
      <Link href="/app/deposit" className="btn-primary">
        Deposit stock
      </Link>
    </header>
  );
}

/* ------------------------------------------------------------------ */

function TopStrip() {
  const summary = usePortfolioSummary();

  // The live document title. The tab shows the portfolio value even in another window.
  useEffect(() => {
    const anchor = { value: summary.valueUsd, at: Date.now() };
    const tick = () => {
      const v = anchor.value + ((Date.now() - anchor.at) / 1000) * summary.streamRatePerSec;
      document.title = `$${fmt(v, 2)} — Osinko`;
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      clearInterval(id);
      document.title = "Osinko — Share stays. Drip flows.";
    };
  }, [summary.valueUsd, summary.streamRatePerSec]);

  return (
    <section className="panel grid grid-cols-2 gap-px bg-panel-line lg:grid-cols-4" aria-label="Portfolio summary">
      <div className="bg-panel p-6">
        <div className="panel-title">Portfolio value</div>
        <div className="mt-3 text-[clamp(26px,2.6vw,38px)] font-semibold tracking-tighter text-panel-text">
          <LiveCounter base={summary.valueUsd} ratePerSec={summary.streamRatePerSec} decimals={2} prefix="$" />
        </div>
        <div className="mt-1 text-[12px] text-panel-muted">Deposits plus everything accrued</div>
      </div>
      <div className="bg-panel p-6">
        <div className="panel-title">Earned this week</div>
        <div className="mt-3 text-[clamp(26px,2.6vw,38px)] font-semibold tracking-tighter text-cyan">
          <AnimatedNumber value={summary.earnedThisWeekUsd} decimals={2} prefix="$" flash="dark" />
        </div>
        <div className="mt-1 text-[12px] text-panel-muted">Advances, claims and compounding</div>
      </div>
      <div className="bg-panel p-6">
        <div className="panel-title">Active rules</div>
        <div className="mt-3 text-[clamp(26px,2.6vw,38px)] font-semibold tracking-tighter text-panel-text">
          <AnimatedNumber value={summary.activeRules} decimals={0} flash="dark" />
        </div>
        <div className="mt-1 text-[12px] text-panel-muted">Positions with a dividend mode set</div>
      </div>
      <div className="bg-panel p-6">
        <div className="panel-title">Next dividend</div>
        {summary.nextDividend ? (
          <>
            <div className="mt-3 text-[clamp(26px,2.6vw,38px)] font-semibold tracking-tighter text-panel-text">
              <Countdown to={summary.nextDividend.exDate} />
            </div>
            <div className="mt-1 text-[12px] text-panel-muted">
              {summary.nextDividend.symbol} goes ex {shortDate(summary.nextDividend.exDate)}
            </div>
          </>
        ) : (
          <div className="mt-3 text-[15px] text-panel-muted">Nothing scheduled</div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function PendingAdvances() {
  const pending = usePendingAdvances();
  const actions = useDataActions();
  if (pending.length === 0) return null;

  return (
    <section className="border border-cyan/30 bg-cyan-soft" aria-label="Pending advances">
      {pending.map((p) => (
        <div key={p.dividendId} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-4">
            <TokenMark symbol={p.symbol} />
            <div>
              <div className="text-[15px] font-extrabold tracking-tight">
                {p.symbol} went ex {relativeTime(p.exDate)}
              </div>
              <div className="text-[13px] text-panel-muted">
                <span className="num font-semibold">${fmt(p.grossUsd)}</span> is yours. Start it now and stop
                waiting until {shortDate(p.payDate)}.
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn-accent btn-sm"
            disabled={actions.busy}
            onClick={() => void actions.startPending(p.dividendId)}
          >
            Start the advance
          </button>
        </div>
      ))}
    </section>
  );
}

/* ------------------------------------------------------------------ */

function StreamsPanel() {
  const { rows, loading } = useStreamRows();
  const open = rows.filter((s) => !s.closed);

  return (
    <section className="panel" aria-label="Your streams">
      <div className="panel-head">
        <span className="panel-title">Your streams</span>
        <span className="text-micro font-bold uppercase text-panel-faint">
          Accruing per second · ex date to pay date
        </span>
      </div>

      {loading ? <StreamSkeleton /> : null}

      {!loading && open.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-[15px] font-bold text-panel-text">No streams running</p>
          <p className="mx-auto mt-2 max-w-sm text-[13px] text-panel-muted">
            Deposit a stock token and pick Stream or Reinvest. The next dividend arrives as a per second flow.
          </p>
          <Link href="/app/deposit" className="btn-accent btn-sm mt-5">
            Deposit stock
          </Link>
        </div>
      ) : null}

      {open.map((s) => (
        <StreamRowView key={s.id} stream={s} />
      ))}
    </section>
  );
}

function StreamRowView({ stream }: { stream: StreamRow }) {
  const actions = useDataActions();
  const [justClaimed, setJustClaimed] = useState(false);
  const progressPct = Math.min(((Date.now() / 1000 - stream.start) / (stream.end - stream.start)) * 100, 100);

  async function claim() {
    await actions.claimStream(stream.id);
    setJustClaimed(true);
    setTimeout(() => setJustClaimed(false), 900);
  }

  return (
    <div className="border-b border-panel-line px-5 py-5 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
        <div className="flex w-[132px] items-center gap-3">
          <TokenMark symbol={stream.symbol} dark />
          <div>
            <div className="text-[15px] font-extrabold tracking-tight text-panel-text">{stream.symbol}</div>
            <div className="text-micro font-bold uppercase text-panel-muted">{MODE_LABEL[stream.mode]}</div>
          </div>
        </div>

        <div className="w-[104px]">
          <div className="panel-title">Rate</div>
          <div className="num mt-1 text-[13px] font-medium text-panel-muted">
            ${(stream.ratePerSec * 3600).toFixed(4)}/hr
          </div>
        </div>

        <div className="min-w-[150px]">
          <div className="panel-title">Accrued</div>
          <div className={`mt-1 text-[22px] font-semibold tracking-tighter text-cyan ${justClaimed ? "flash-dark" : ""}`}>
            <StreamTicker stream={stream} />
          </div>
        </div>

        <div className="w-[96px]">
          <div className="panel-title">Total</div>
          <div className="num mt-1 text-[15px] font-medium text-panel-text">${fmt(stream.totalUsd)}</div>
        </div>

        <button
          type="button"
          className="btn-accent btn-sm ml-auto"
          disabled={actions.busy}
          onClick={() => void claim()}
        >
          {stream.mode === "REINVEST" ? "Claim + reinvest" : "Claim"}
        </button>
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-micro font-bold uppercase text-panel-faint">
          <span>Ex {shortDate(stream.start)}</span>
          <span className="num">{progressPct.toFixed(0)}%</span>
          <span>Pay {shortDate(stream.end)}</span>
        </div>
        <div className="mt-1.5 h-1 w-full bg-panel-line">
          <div className="h-1 bg-cyan transition-[width] duration-700 ease-osk" style={{ width: `${progressPct}%` }} />
        </div>
      </div>
    </div>
  );
}

function StreamSkeleton() {
  return (
    <div className="space-y-4 px-5 py-5">
      {[0, 1].map((i) => (
        <div key={i} className="space-y-3">
          <div className="skeleton-dark h-9 w-2/3" />
          <div className="skeleton-dark h-1 w-full" />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function HoldingsPanel() {
  const { rows, loading } = useHoldings();
  const actions = useDataActions();

  return (
    <section className="panel" aria-label="Holdings">
      <div className="panel-head">
        <span className="panel-title">Holdings</span>
        <Link href="/app/deposit" className="text-micro font-bold uppercase text-cyan hover:text-panel-text">
          Deposit or withdraw
        </Link>
      </div>

      <div className="dark-scroll max-w-full overflow-x-auto">
        <table className="panel-table min-w-[680px] text-[14px]">
          <thead>
            <tr>
              <th>Token</th>
              <th>Deposited</th>
              <th>Value</th>
              <th>Mode</th>
              <th className="text-right">Today</th>
            </tr>
          </thead>
          <tbody>
            {loading
              ? [0, 1, 2].map((i) => (
                  <tr key={i}>
                    <td colSpan={5}>
                      <div className="skeleton-dark h-8 w-full" />
                    </td>
                  </tr>
                ))
              : rows.map((h) => (
                  <tr key={h.symbol}>
                    <td>
                      <div className="flex items-center gap-3">
                        <TokenMark symbol={h.symbol} dark size={28} />
                        <span className="font-extrabold tracking-tight text-panel-text">{h.symbol}</span>
                      </div>
                    </td>
                    <td>
                      <AnimatedNumber value={h.amount} decimals={4} className="text-panel-muted" flash="dark" />
                    </td>
                    <td>
                      <AnimatedNumber value={h.valueUsd} decimals={2} prefix="$" className="font-medium text-panel-text" flash="dark" />
                    </td>
                    <td>
                      <div className="seg-dark" role="group" aria-label={`${h.symbol} dividend mode`}>
                        {MODES.map((m) => (
                          <button
                            key={m}
                            type="button"
                            aria-pressed={h.mode === m}
                            disabled={actions.busy}
                            title={MODE_LABEL[m]}
                            onClick={() => h.mode !== m && void actions.setMode(h.symbol, m)}
                          >
                            {MODE_LABEL[m].split(" ")[0]}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-3">
                        <Sparkline points={h.spark} width={76} up={h.movePct >= 0} dark />
                        <span className={`num w-[58px] text-right text-[12px] font-medium ${h.movePct >= 0 ? "text-cyan" : "text-down"}`}>
                          {h.movePct >= 0 ? "+" : ""}
                          {h.movePct.toFixed(2)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

const KIND_LABEL: Record<string, string> = {
  deposit: "Deposit",
  withdraw: "Withdraw",
  advance: "Advance",
  claim: "Claim",
  reinvest: "Reinvest",
  mode: "Rule",
  vault: "Vault",
  settle: "Settle",
};

function ActivityFeed() {
  const { rows, loading } = useActivityRows();

  return (
    <section className="panel min-w-0 self-start" aria-label="Activity">
      <div className="flex items-center justify-between border-b border-panel-line px-5 py-4">
        <span className="serial">Activity</span>
        <span className="text-micro font-bold uppercase text-panel-muted">From events</span>
      </div>

      {loading ? (
        <div className="space-y-3 p-5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-10 w-full" />
          ))}
        </div>
      ) : null}

      {!loading && rows.length === 0 ? (
        <p className="px-5 py-8 text-[13px] text-panel-muted">Deposits, claims and reinvestments land here.</p>
      ) : null}

      <ul>
        {rows.slice(0, 14).map((row) => (
          <li key={row.id} className="hairline-b border-l-2 border-l-cyan px-4 py-3 last:border-b-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-micro font-bold uppercase text-panel-muted">{KIND_LABEL[row.kind] ?? row.kind}</span>
              <span className="text-micro font-bold uppercase text-panel-muted">{relativeTime(row.ts)}</span>
            </div>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <span className="text-[13px]">{row.summary}</span>
              {row.amountUsd !== null ? (
                <span className="num shrink-0 text-[13px] font-semibold">${fmt(row.amountUsd)}</span>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
