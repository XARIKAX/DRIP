"use client";

import { useState } from "react";
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
    <div className="rise-group space-y-10">
      <header className="max-w-2xl border-b border-line pb-8">
        <div className="serial">The trade side</div>
        <h1 className="mt-4 display text-display">Split</h1>
        <p className="mt-5 text-[16px] leading-relaxed text-muted">
          Deposit a stock token, receive two: a Principal Token redeemable for the whole
          share at maturity, and a Yield Token that carries every dividend it pays out
          before then. Merge them back at par, free, any time before maturity — the same
          promise a certificate&apos;s own perforation makes, just liquid on both sides of it.
        </p>
      </header>

      {active ? (
        <SplitSeriesPage series={active} />
      ) : (
        <div className="border border-line-soft bg-paper-2 px-6 py-14 text-center">
          <div className="display text-title">No series open</div>
          <p className="mx-auto mt-3 max-w-md text-[14px] leading-relaxed text-muted">
            A keeper opens a series against a stock token and a maturity date. None is
            open right now.
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

  const ptValue = (position?.ptBalance ?? 0) * series.underlyingPriceUsd;
  const ytAnnual = (position?.ytBalance ?? 0) * series.underlyingPriceUsd * (series.impliedYieldApr / 100);

  return (
    <>
      <section className="panel" aria-label="Series position">
        <div className="grid grid-cols-2 gap-px bg-panel-line lg:grid-cols-4">
          <div className="bg-panel p-6">
            <div className="panel-title">Principal held</div>
            <div className="mt-3 flex items-baseline gap-2">
              <TokenMark symbol={series.symbol} dark size={22} />
              <span className="text-[clamp(22px,2.2vw,32px)] font-semibold tracking-tighter text-panel-text">
                <AnimatedNumber value={position?.ptBalance ?? 0} decimals={4} flash="dark" />
              </span>
            </div>
            <div className="mt-1 text-[12px] text-panel-muted">${fmt(ptValue, 0)} redeemable at maturity</div>
          </div>
          <div className="bg-panel p-6">
            <div className="panel-title">Yield held</div>
            <div className="mt-3 text-[clamp(22px,2.2vw,32px)] font-semibold tracking-tighter text-cyan">
              <AnimatedNumber value={position?.ytBalance ?? 0} decimals={4} flash="dark" />
            </div>
            <div className="mt-1 text-[12px] text-panel-muted">≈${fmt(ytAnnual, 0)}/yr at the implied rate</div>
          </div>
          <div className="bg-panel p-6">
            <div className="panel-title">Maturity</div>
            <div className={`mt-3 text-[clamp(20px,2vw,28px)] font-semibold tracking-tighter ${matured ? "text-cyan" : "text-panel-text"}`}>
              {matured ? "Matured" : <Countdown to={series.maturity} />}
            </div>
            <div className="mt-1 text-[12px] text-panel-muted">{shortDate(series.maturity)}</div>
          </div>
          <div className="bg-panel p-6">
            <div className="panel-title">Implied yield</div>
            <div className="mt-3 text-[clamp(22px,2.2vw,32px)] font-semibold tracking-tighter text-panel-text">
              {series.impliedYieldApr.toFixed(2)}<span className="text-[15px] text-panel-muted">% APR</span>
            </div>
            <div className="mt-1 text-[12px] text-panel-muted">{(series.splitFeeBps / 100).toFixed(2)}% split fee, merge free</div>
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
        <span className="panel-title">The drip, harvested</span>
        <span className="text-micro font-bold uppercase text-panel-faint">Every dividend this series has seen</span>
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-10 text-center text-[13px] text-panel-muted">
          Nothing declared for {series.symbol} yet.
        </div>
      ) : (
        <div>
          {rows.map((row) => {
            const past = Date.now() >= row.exDate * 1000;
            const canHarvest = past && !row.harvested;
            const canClaim = row.harvested && !row.claimed && row.claimableUsd > 0;
            const busy = actions.busy && busyId === row.dividendId;

            return (
              <div
                key={row.dividendId}
                className="flex flex-wrap items-center justify-between gap-4 border-b border-panel-line px-6 py-4 last:border-b-0"
              >
                <div>
                  <div className="text-[14px] font-bold tracking-tight text-panel-text">
                    ${fmt(row.perShare)} / share
                  </div>
                  <div className="mt-1 text-micro font-bold uppercase text-panel-faint">
                    Ex {shortDate(row.exDate)} · {past ? (row.harvested ? "Harvested" : "Awaiting harvest") : "Not yet ex"}
                  </div>
                </div>

                {row.harvested ? (
                  <div className="text-right">
                    <div className="num text-[15px] font-semibold text-cyan">
                      {row.claimed ? "Claimed" : `$${fmt(row.claimableUsd)} yours`}
                    </div>
                    <div className="text-[11px] text-panel-faint">${fmt(row.poolUsd)} pool</div>
                  </div>
                ) : null}

                {canHarvest ? (
                  <button type="button" className="btn-accent btn-sm" disabled={busy} onClick={() => void harvest(row.dividendId)}>
                    Harvest
                  </button>
                ) : canClaim ? (
                  <button type="button" className="btn-accent btn-sm" disabled={busy} onClick={() => void claim(row.dividendId)}>
                    Claim yield
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <p className="border-t border-panel-line px-6 py-4 text-[12px] leading-relaxed text-panel-faint">
        Harvesting is permissionless — anyone can pull a declared dividend into the pool
        once it goes ex. Claiming pays out pro rata to whoever held the Yield Token at
        that exact ex date, proven from the token&apos;s own transfer history, not from who
        holds it now.
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
              activeTab === t ? "border-cyan text-cyan" : "border-panel-line text-panel-muted hover:text-panel-text"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="space-y-4 p-5">
        <div className="flex items-baseline justify-between text-micro font-bold uppercase text-panel-muted">
          <span>
            {activeTab === "split" ? `${series.symbol} spare in wallet` : activeTab === "merge" ? "PT + YT held" : "Redeemable now"}
          </span>
          <span className="num">{fmt(max, 4)}</span>
        </div>
        <div className="flex gap-2">
          <input
            className="num w-full border border-panel-line bg-panel-2 px-4 py-3 text-[16px] text-panel-text outline-none placeholder:text-panel-faint focus:border-cyan"
            inputMode="decimal"
            placeholder="0.0000"
            aria-label={`Shares to ${activeTab}`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button
            type="button"
            className="border border-panel-line px-3 text-micro font-bold uppercase text-panel-muted hover:text-panel-text"
            onClick={() => setAmount(max > 0 ? max.toFixed(4) : "")}
          >
            Max
          </button>
        </div>

        <dl className="text-[13px]">
          <div className="flex justify-between border-b border-panel-line py-2">
            <dt className="text-panel-muted">Split fee</dt>
            <dd className="num text-panel-text">{(series.splitFeeBps / 100).toFixed(2)}%</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-panel-muted">Merge / redeem fee</dt>
            <dd className="num text-panel-text">None</dd>
          </div>
        </dl>

        <button type="button" className="btn-accent w-full" disabled={!valid || actions.busy} onClick={() => void submit()}>
          {activeTab === "split" ? "Split into PT + YT" : activeTab === "merge" ? "Merge back to stock" : "Redeem principal"}
        </button>
        {error ? <p className="text-[12px] text-down">{error}</p> : null}
        <p className="text-[12px] leading-snug text-panel-faint">
          {activeTab === "split"
            ? "Mints equal PT and YT, net of the split fee. The stock deposits into the same vault Early holders use, so it keeps earning until maturity."
            : activeTab === "merge"
              ? "Burns equal PT and YT and returns the whole stock token. Works before or after maturity, and never costs a fee."
              : "Burns PT alone for the underlying stock token. Only available once the series has matured."}
        </p>
      </div>
    </section>
  );
}

function HowItWorks() {
  const rows = [
    {
      n: "01",
      h: "One deposit, two tokens",
      p: "Split a stock token and receive a Principal Token and a Yield Token, minted 1:1 net of a small fee. The stock itself sits in custody, still earning, until one of them is redeemed.",
    },
    {
      n: "02",
      h: "The drip has its own price",
      p: "The Yield Token is a claim on every dividend the stock pays before maturity — nothing else. Trade it, and you are trading the dividend on its own, separated from the share underneath it.",
    },
    {
      n: "03",
      h: "Merge back, free, any time",
      p: "Hold equal PT and YT and you can always recombine them into the whole stock token, at par, with no fee — the same certificate, made whole again, whenever you want it back.",
    },
  ];
  return (
    <section aria-label="How splitting works" className="space-y-6">
      <div>
        <div className="eyebrow text-cyan">How it works</div>
        <div className="mt-4">
          {rows.map((r) => (
            <div key={r.n} className="hairline-t grid gap-2 py-5 md:grid-cols-12 md:gap-6">
              <div className="num text-micro font-bold text-cyan md:col-span-1">{r.n}</div>
              <h3 className="text-[17px] font-extrabold tracking-tight md:col-span-4">{r.h}</h3>
              <p className="text-[14px] leading-relaxed text-panel-muted md:col-span-7">{r.p}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
