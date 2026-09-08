"use client";

import { useState } from "react";
import { Steps } from "@/components/app/Steps";
import { AnimatedNumber, Countdown, fmt, shortDate } from "@/components/live";
import { TokenMark } from "@/components/TokenMark";
import {
  useDataActions,
  useSplitDividendRows,
  useSplitPosition,
  useSplitSeries,
  useSplitWalletBalance,
} from "@/lib/data/provider";
import type { SplitSeries } from "@/lib/data/types";

/**
 * The trade side. The one module that wraps the share: split a stock token into a
 * Principal Token — the share, minus the drip, redeemable 1:1 at maturity — and a
 * Yield Token — the drip alone, a liquid position on its own until then.
 *
 * Early, Stream, Reinvest and Borrow never touch what a holder holds; this is the
 * one page that does, and only because a holder specifically asked it to. The
 * default product is still "hold the share" — Split exists beside that, not instead
 * of it, for the dividend to be traded rather than streamed or lent against.
 */
export default function SplitPage() {
  const series = useSplitSeries();
  const active = series[0] ?? null;

  return (
    <div className="rise-group space-y-10" data-shot="split">
      <header className="max-w-2xl border-b border-line pb-8">
        <div className="serial">Sell the dividend on its own</div>
        <h1 className="mt-4 display text-display">Split</h1>
        <p className="mt-5 text-[16px] leading-relaxed text-muted">
          Turn one share into two tokens. The first is the share itself. You get it back
          in full on the end date. The second is every dividend that share pays until then.
          Sell either one, or put them back together at any time for free.
        </p>
      </header>

      {active ? (
        <SplitSeriesPage series={active} />
      ) : (
        <div className="border border-line-soft bg-ground-2 px-6 py-14 text-center">
          <div className="display text-title">Nothing to split yet</div>
          <p className="mx-auto mt-3 max-w-md text-[14px] leading-relaxed text-muted">
            Splitting opens one stock at a time, with an end date. None is open right now.
          </p>
        </div>
      )}

      <HowItWorks />
    </div>
  );
}

function SplitSeriesPage({ series }: { series: SplitSeries }) {
  const position = useSplitPosition(series.seriesId);
  const dividends = useSplitDividendRows(series.seriesId);
  const matured = Date.now() >= series.maturity * 1000;

  // Null price means these are unknown, not zero: the panels show a dash instead.
  const ptValue = series.underlyingPriceUsd === null ? null : (position?.ptBalance ?? 0) * series.underlyingPriceUsd;
  const ytAnnual =
    series.underlyingPriceUsd === null
      ? null
      : (position?.ytBalance ?? 0) * series.underlyingPriceUsd * (series.impliedYieldApr / 100);

  return (
    <>
      <section className="panel" aria-label="Series position">
        <div className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
          <div className="bg-ground p-6">
            <div className="panel-title">Share tokens you hold</div>
            <div className="mt-3 flex items-baseline gap-2">
              <TokenMark symbol={series.symbol} dark size={22} />
              <span className="text-[clamp(22px,2.2vw,32px)] font-semibold tracking-tighter text-ink">
                <AnimatedNumber value={position?.ptBalance ?? 0} decimals={4} flash="dark" />
              </span>
            </div>
            <div className="mt-1 text-[12px] text-muted">Worth {ptValue === null ? "an unknown amount" : `$${fmt(ptValue, 0)}`} in stock on the end date</div>
          </div>
          <div className="bg-ground p-6">
            <div className="panel-title">Dividend tokens you hold</div>
            <div className="mt-3 text-[clamp(22px,2.2vw,32px)] font-semibold tracking-tighter text-accent">
              <AnimatedNumber value={position?.ytBalance ?? 0} decimals={4} flash="dark" />
            </div>
            <div className="mt-1 text-[12px] text-muted">About {ytAnnual === null ? "an unknown amount" : `$${fmt(ytAnnual, 0)}`} a year in dividends</div>
          </div>
          <div className="bg-ground p-6">
            <div className="panel-title">End date</div>
            <div className={`mt-3 text-[clamp(20px,2vw,28px)] font-semibold tracking-tighter ${matured ? "text-accent" : "text-ink"}`}>
              {matured ? "Reached" : <Countdown to={series.maturity} />}
            </div>
            <div className="mt-1 text-[12px] text-muted">{shortDate(series.maturity)}</div>
          </div>
          <div className="bg-ground p-6">
            <div className="panel-title">Dividend yield</div>
            <div className="mt-3 text-[clamp(22px,2.2vw,32px)] font-semibold tracking-tighter text-ink">
              {series.impliedYieldApr.toFixed(2)}<span className="text-[15px] text-muted">% a year</span>
            </div>
            <div className="mt-1 text-[12px] text-muted">{(series.splitFeeBps / 100).toFixed(2)}% fee to split, free to rejoin</div>
          </div>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-3">
        <YieldPanel series={series} rows={dividends} />
        <ActionPanel series={series} matured={matured} />
      </div>
    </>
  );
}

function YieldPanel({ series, rows }: { series: SplitSeries; rows: ReturnType<typeof useSplitDividendRows> }) {
  const actions = useDataActions();
  const [busyId, setBusyId] = useState<number | null>(null);

  async function harvest(dividendId: number) {
    setBusyId(dividendId);
    try {
      await actions.harvestDividend(series.seriesId, dividendId);
    } finally {
      setBusyId(null);
    }
  }

  async function claim(dividendId: number) {
    setBusyId(dividendId);
    try {
      await actions.claimYield(series.seriesId, dividendId);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="panel lg:col-span-2" aria-label="Yield pool">
      <div className="panel-head">
        <span className="panel-title">Dividends</span>
        <span className="text-micro font-bold uppercase text-faint">Every payout on this stock</span>
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-10 text-center text-[13px] text-muted">
          No dividends announced for {series.symbol} yet.
        </div>
      ) : (
        <div>
          {rows.map((row) => {
            const past = Date.now() >= row.exDate * 1000;
            // A dividend that went ex before this series held any stock pays it
            // nothing, and collecting would revert. Say so instead of offering it.
            const canHarvest = past && row.eligible && !row.harvested;
            const canClaim = row.harvested && !row.claimed && row.claimableUsd > 0;
            const busy = actions.busy && busyId === row.dividendId;

            return (
              <div
                key={row.dividendId}
                className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-6 py-4 last:border-b-0"
              >
                <div>
                  <div className="text-[14px] font-bold tracking-tight text-ink">
                    ${fmt(row.perShare)} / share
                  </div>
                  <div className="mt-1 text-micro font-bold uppercase text-faint">
                    Ex date {shortDate(row.exDate)} ·{" "}
                    {!past
                      ? "Not yet"
                      : !row.eligible
                        ? "Before this split existed"
                        : row.harvested
                          ? "Collected"
                          : "Ready to collect"}
                  </div>
                </div>

                {row.harvested ? (
                  <div className="text-right">
                    <div className="num text-[15px] font-semibold text-accent">
                      {row.claimed ? "Paid to you" : `$${fmt(row.claimableUsd)} is yours`}
                    </div>
                    <div className="text-[11px] text-faint">${fmt(row.poolUsd)} total for everyone</div>
                  </div>
                ) : null}

                {canHarvest ? (
                  <button type="button" className="btn-accent btn-sm" disabled={busy} onClick={() => void harvest(row.dividendId)}>
                    Collect it
                  </button>
                ) : canClaim ? (
                  <button type="button" className="btn-accent btn-sm" disabled={busy} onClick={() => void claim(row.dividendId)}>
                    Take my share
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <p className="border-t border-line px-6 py-4 text-[12px] leading-relaxed text-faint">
        Anyone can press collect once a dividend&apos;s ex date has passed. The money is then
        shared out to whoever held dividend tokens on that exact day. If you sold your
        tokens the day after, you still get paid for that one.
      </p>
    </section>
  );
}

function ActionPanel({ series, matured }: { series: SplitSeries; matured: boolean }) {
  const position = useSplitPosition(series.seriesId);
  const wallet = useSplitWalletBalance(series.symbol);
  const actions = useDataActions();
  const [tab, setTab] = useState<"split" | "merge" | "redeem">("split");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const tabs = matured ? (["merge", "redeem"] as const) : (["split", "merge"] as const);
  const activeTab = tabs.includes(tab as never) ? tab : tabs[0];

  const shares = Number.parseFloat(amount) || 0;
  const max =
    activeTab === "split" ? wallet : activeTab === "merge" ? Math.min(position?.ptBalance ?? 0, position?.ytBalance ?? 0) : position?.ptBalance ?? 0;
  const valid = shares > 0 && shares <= max;

  async function submit() {
    if (!valid) return;
    setError(null);
    try {
      if (activeTab === "split") await actions.split(series.seriesId, shares);
      else if (activeTab === "merge") await actions.merge(series.seriesId, shares);
      else await actions.redeemPrincipal(series.seriesId, shares);
      setAmount("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <section className="panel self-start" aria-label="Split, merge or redeem">
      {/* Both branches of `tabs` are exactly two entries — hardcoded rather than built
          from tabs.length, since Tailwind can only generate classes it can see written
          out literally somewhere in the source. */}
      <div className="grid grid-cols-2" role="tablist" aria-label="Split, merge or redeem">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={activeTab === t}
            onClick={() => setTab(t)}
            className={`border-b px-4 py-3 text-micro font-bold uppercase transition-colors ${
              activeTab === t ? "border-accent text-accent" : "border-line text-muted hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="space-y-4 p-5">
        <div className="flex items-baseline justify-between text-micro font-bold uppercase text-muted">
          <span>
            {activeTab === "split" ? `${series.symbol} in your wallet` : activeTab === "merge" ? "Pairs you can rejoin" : "Share tokens you can cash in"}
          </span>
          <span className="num">{fmt(max, 4)}</span>
        </div>
        <div className="flex gap-2">
          <input
            className="field text-[16px]"
            inputMode="decimal"
            placeholder="0.0000"
            aria-label={`Shares to ${activeTab}`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button
            type="button"
            className="border border-line px-3 text-micro font-bold uppercase text-muted hover:text-ink"
            onClick={() => setAmount(max > 0 ? max.toFixed(4) : "")}
          >
            Max
          </button>
        </div>

        <dl className="text-[13px]">
          <div className="flex justify-between border-b border-line py-2">
            <dt className="text-muted">Fee to split</dt>
            <dd className="num text-ink">{(series.splitFeeBps / 100).toFixed(2)}%</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-muted">Fee to rejoin or cash in</dt>
            <dd className="num text-ink">None</dd>
          </div>
        </dl>

        <button type="button" className="btn-accent w-full" disabled={!valid || actions.busy} onClick={() => void submit()}>
          {activeTab === "split" ? "Split it" : activeTab === "merge" ? "Rejoin into stock" : "Cash in for stock"}
        </button>
        {error ? <p className="text-[12px] text-down">{error}</p> : null}
        <p className="text-[12px] leading-snug text-faint">
          {activeTab === "split"
            ? "You get one share token and one dividend token for each share, minus the small fee. The stock keeps earning dividends the whole time."
            : activeTab === "merge"
              ? "Hand back one share token and one dividend token, get the whole share back. Works any time, and never costs a fee."
              : "Hand back share tokens alone and get the stock back. Only possible once the end date has passed."}
        </p>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <Steps
      label="How splitting works"
      steps={[
        {
          h: "One share becomes two tokens",
          p: "Split a share and you get a share token and a dividend token. The share token is the stock itself, minus its dividends. The dividend token is the dividends, minus the stock.",
        },
        {
          h: "The dividend gets its own price",
          p: "The dividend token is worth exactly the dividends the stock will pay before the end date, and nothing else. Sell it, and you have sold the dividends on their own.",
        },
        {
          h: "Rejoin them any time, for free",
          p: "Hold one of each and you can always put them back together into the whole share. No fee, no waiting. The same stock, whole again, whenever you want it.",
        },
      ]}
    />
  );
}
