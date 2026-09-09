"use client";

import { AnimatedNumber, fmt } from "@/components/live";
import { TokenMark } from "@/components/TokenMark";
import { useTokensView, useTrackerView } from "@/lib/data/provider";
import { isDeployed } from "@/lib/chain.config";

/**
 * The public scoreboard.
 *
 * Two questions, answered from the chain and nowhere else: how much stock is Osinko
 * holding, and how much money has it actually handed to the people who deposited it.
 * No projections, no annualised anything — the second number only moves when USDG
 * genuinely leaves the reward vault for someone's wallet.
 */
export default function TrackerPage() {
  return (
    <div className="rise-group space-y-10">
      <header className="max-w-2xl border-b border-line pb-8">
        <div className="serial">Live from the chain</div>
        <h1 className="mt-4 display text-display">Tracker</h1>
        <p className="mt-5 text-[16px] leading-relaxed text-muted">
          Everything on this page is read straight off Robinhood Chain when you load it.
          Nothing is estimated and nothing is projected forward.
        </p>
      </header>

      <Totals />
      <ByToken />
      <Rates />
    </div>
  );
}

function Totals() {
  const { tracker, loading } = useTrackerView();

  if (!isDeployed) {
    return (
      <section className="panel p-6 text-[14px] text-muted">
        This network has no Osinko deployment, so there is nothing to track. Switch to
        Robinhood Chain.
      </section>
    );
  }

  if (!tracker) {
    return (
      <section className="panel p-6 text-[14px] text-muted">
        {loading ? "Reading the chain…" : "Connect a wallet to read the chain."}
      </section>
    );
  }

  return (
    <section className="panel" aria-label="Platform totals" data-shot="tracker">
      <div className="grid gap-px bg-line md:grid-cols-2">
        <div className="bg-ground p-6 md:p-8">
          <div className="panel-title">Stock held by Osinko</div>
          <div className="mt-3 text-[clamp(30px,4vw,52px)] font-semibold tracking-tighter text-ink">
            <AnimatedNumber value={tracker.stockUsd} decimals={2} prefix="$" flash="dark" />
          </div>
          <p className="mt-2 text-[13px] text-muted">
            Every deposited share, priced by the same oracle the rest of the app uses.
          </p>
          {tracker.unpriced.length > 0 && (
            <p className="mt-2 text-[12px] leading-snug text-faint">
              Not counted: {tracker.unpriced.join(", ")} — the price feed has gone quiet, so
              that stock is real but unpriced and this figure is a floor.
            </p>
          )}
        </div>
        <div className="bg-ground p-6 md:p-8">
          <div className="panel-title">Paid out to holders</div>
          <div className="mt-3 text-[clamp(30px,4vw,52px)] font-semibold tracking-tighter text-accent">
            <AnimatedNumber value={tracker.paidOutUsd} decimals={2} prefix="$" flash="dark" />
          </div>
          <p className="mt-2 text-[13px] text-muted">
            USDG that has left the reward vault and reached someone&apos;s wallet.
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-px border-t border-line bg-line md:grid-cols-3">
        {[
          {
            label: "Earned, not yet collected",
            value: `$${fmt(tracker.owedUsd)}`,
            note: "Sitting as YT, one dollar each",
          },
          {
            label: "Put into rewards",
            value: `$${fmt(tracker.fundedUsd)}`,
            note: "Osinko's own USDG, cumulative",
          },
          {
            label: "Still to hand out",
            value: `$${fmt(Math.max(0, tracker.fundedUsd - tracker.paidOutUsd - tracker.owedUsd))}`,
            note: "Funded, unallocated",
          },
        ].map((s) => (
          <div key={s.label} className="bg-ground px-6 py-4">
            <dt className="panel-title">{s.label}</dt>
            <dd className="num mt-1.5 text-[17px] font-medium text-ink">{s.value}</dd>
            <div className="mt-0.5 text-[12px] text-faint">{s.note}</div>
          </div>
        ))}
      </dl>

      <p className="border-t border-line px-6 py-3 text-[12px] leading-snug text-faint">
        &ldquo;Paid out&rdquo; counts reward redemptions only. Dividend advances and streams
        keep no running total on chain, so they are not in this number; none have been paid
        on this deployment yet.
      </p>
    </section>
  );
}

function ByToken() {
  const { tracker } = useTrackerView();
  const rows = (tracker?.rows ?? []).filter((r) => r.amount > 0);
  if (rows.length === 0) return null;

  const total = rows.reduce((a, r) => a + (r.valueUsd ?? 0), 0);

  return (
    <section className="panel" aria-label="Deposits by stock">
      <div className="panel-head">
        <span className="panel-title">What is on deposit</span>
        <span className="num text-micro font-bold uppercase text-muted">{rows.length} tickers</span>
      </div>
      <ul>
        {rows.map((r) => (
          <li key={r.symbol} className="flex items-center gap-4 border-b border-line px-5 py-4 last:border-b-0">
            <TokenMark symbol={r.symbol} />
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-extrabold tracking-tight">{r.symbol}</div>
              <div className="num text-[13px] text-muted">{fmt(r.amount, 4)} on deposit</div>
            </div>
            <div className="w-28 shrink-0 text-right">
              <div className="num text-[15px] font-medium text-ink">
                {r.valueUsd === null ? "—" : `$${fmt(r.valueUsd)}`}
              </div>
              <div className="text-[12px] text-faint">
                {r.valueUsd === null
                  ? "no price"
                  : total > 0
                    ? `${((r.valueUsd / total) * 100).toFixed(1)}%`
                    : ""}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Rates() {
  const tokens = useTokensView();
  const rated = tokens.filter((t) => t.yieldPct !== null);
  if (rated.length === 0) return null;

  return (
    <section className="panel" aria-label="Reward rates">
      <div className="panel-head">
        <span className="panel-title">Reward rate by stock</span>
        <span className="text-micro font-bold uppercase text-muted">Per year</span>
      </div>
      <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3 lg:grid-cols-4">
        {rated.map((t) => (
          <div key={t.symbol} className="flex items-center justify-between gap-3 bg-ground px-5 py-4">
            <span className="text-[14px] font-extrabold tracking-tight">{t.symbol}</span>
            <span className="num text-[14px] font-medium text-accent">{t.yieldPct?.toFixed(2)}%</span>
          </div>
        ))}
      </div>
      <p className="border-t border-line px-5 py-3 text-[12px] leading-snug text-faint">
        Osinko funds these rewards itself out of its own USDG. They are not the dividend the
        company pays, and Osinko can change or stop them.
      </p>
    </section>
  );
}
