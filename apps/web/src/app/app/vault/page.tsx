"use client";

import { useState } from "react";
import { Steps } from "@/components/app/Steps";
import { AnimatedNumber, fmt } from "@/components/live";
import { AreaChart, Meter } from "@/components/charts";
import { useDataActions, useVaultView, useWalletView } from "@/lib/data/provider";

/**
 * The LP pitch page plus terminal. Dark stats, light explainer, one meter with the
 * cap marked, and a yield history that draws itself in.
 */
export default function VaultPage() {
  return (
    <div className="rise-group space-y-10">
      <header className="max-w-2xl border-b border-line pb-8">
        <div className="serial">Where the early money comes from</div>
        <h1 className="mt-4 display text-display">The pool</h1>
        <p className="mt-5 text-[16px] leading-relaxed text-muted">
          One pool of USDG does two jobs. It pays dividends out weeks early, and it lends
          against people&apos;s stock. Put USDG in and you earn the 1% early payment fee plus the
          interest on loans.
        </p>
      </header>

      <HeroStats />

      <div className="grid gap-8 lg:grid-cols-3">
        <YieldChart />
        <LpPanel />
      </div>

      <HowItEarns />
    </div>
  );
}

function HeroStats() {
  const { vault, loading } = useVaultView();

  return (
    <section
      className={`panel transition-opacity ${loading ? "opacity-40" : ""}`}
      aria-label="Vault statistics"
      aria-busy={loading}
      data-shot="vault"
    >
      <div className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
        <div className="bg-ground p-6">
          <div className="panel-title">In the pool</div>
          <div className="mt-3 text-[clamp(24px,2.4vw,34px)] font-semibold tracking-tighter text-ink">
            <AnimatedNumber value={vault.tvlUsd} decimals={0} prefix="$" flash="dark" />
          </div>
          <div className="mt-1 text-[12px] text-muted">USDG put in by lenders</div>
        </div>
        <div className="bg-ground p-6">
          <div className="panel-title">Yearly return</div>
          <div className="mt-3 text-[clamp(24px,2.4vw,34px)] font-semibold tracking-tighter text-accent">
            <AnimatedNumber value={vault.apyPct} decimals={2} suffix="%" flash="dark" />
          </div>
          <div className="mt-1 text-[12px] text-muted">From the 1% fee and loan interest</div>
        </div>
        <div className="bg-ground p-6">
          <div className="panel-title">Lent out</div>
          <div className="mt-3 text-[clamp(24px,2.4vw,34px)] font-semibold tracking-tighter text-ink">
            <AnimatedNumber value={vault.utilizationPct} decimals={1} suffix="%" flash="dark" />
          </div>
          <div className="mt-3">
            <Meter pct={vault.utilizationPct} capPct={vault.capPct} />
          </div>
          <div className="mt-1.5 flex justify-between text-micro font-bold uppercase text-faint">
            <span>Of the pool</span>
            <span>Limit {vault.capPct.toFixed(0)}%</span>
          </div>
        </div>
        <div className="bg-ground p-6">
          <div className="panel-title">Paid out early</div>
          <div className="mt-3 text-[clamp(24px,2.4vw,34px)] font-semibold tracking-tighter text-ink">
            <AnimatedNumber value={vault.advancesOutstandingUsd} decimals={0} prefix="$" flash="dark" />
          </div>
          <div className="mt-1 text-[12px] text-muted">Companies pay this back on their pay dates</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-px border-t border-line bg-line">
        {[
          { label: "Cash available now", value: `$${fmt(vault.freeLiquidityUsd, 0)}` },
          { label: "Fees earned so far", value: `$${fmt(vault.feesEarnedUsd, 0)}` },
          { label: "Value of one pool share", value: fmt(vault.sharePrice, 4) },
        ].map((s) => (
          <div key={s.label} className="bg-ground px-6 py-4">
            <div className="panel-title">{s.label}</div>
            <div className="num mt-1.5 text-[17px] font-medium text-ink">{s.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function YieldChart() {
  const { vault, loading } = useVaultView();

  // A real pool has one point, not ninety: there is no historical series onchain to
  // read. The axis labels only make sense over a series, so they go with it.
  const series = vault.apyHistory.length > 1;

  return (
    <section className="panel lg:col-span-2" aria-label="Yield history" aria-busy={loading}>
      <div className="panel-head">
        <span className="panel-title">{series ? "Yearly return · last 90 days" : "Yearly return"}</span>
        <span className="num text-micro font-bold uppercase text-accent">
          {loading ? "Reading…" : `${vault.apyPct.toFixed(2)}% now`}
        </span>
      </div>
      <div className="p-5">
        {vault.apyHistory.length === 0 ? (
          <div className="flex h-[180px] items-center justify-center text-[13px] text-muted">
            {loading ? "Reading the chain…" : "No fees earned yet, so there is no return to plot."}
          </div>
        ) : (
          <AreaChart
            points={vault.apyHistory}
            labelLeft={series ? "90 days ago" : ""}
            labelRight={series ? "Today" : "Today"}
            formatValue={(v) => `${v.toFixed(1)}%`}
          />
        )}
      </div>
    </section>
  );
}

function LpPanel() {
  const { vault } = useVaultView();
  const wallet = useWalletView();
  const actions = useDataActions();
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");

  const usd = Number.parseFloat(amount) || 0;
  const max = tab === "deposit" ? wallet.usdg : vault.maxWithdrawUsd;
  const valid = usd > 0 && usd <= max;
  const shares = usd / vault.sharePrice;

  async function submit() {
    if (!valid) return;
    if (tab === "deposit") await actions.vaultDeposit(usd);
    else await actions.vaultWithdraw(usd);
    setAmount("");
  }

  return (
    <section className="panel self-start" aria-label="Your position">
      <div className="grid grid-cols-2" role="tablist" aria-label="Deposit or withdraw">
        {(["deposit", "withdraw"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`border-b px-4 py-3 text-micro font-bold uppercase transition-colors ${
              tab === t ? "border-accent text-accent" : "border-line text-muted hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="space-y-4 p-5">
        <div className="flex items-baseline justify-between text-micro font-bold uppercase text-muted">
          <span>{tab === "deposit" ? "USDG in your wallet" : "You can take out"}</span>
          <span className="num">${fmt(max)}</span>
        </div>
        <div className="flex gap-2">
          <input
            className="field text-[16px]"
            inputMode="decimal"
            placeholder="0.00"
            aria-label={`USDG to ${tab}`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button
            type="button"
            className="border border-line px-3 text-micro font-bold uppercase text-muted hover:text-ink"
            onClick={() => setAmount(max > 0 ? max.toFixed(2) : "")}
          >
            Max
          </button>
        </div>

        <dl className="text-[13px]">
          <div className="flex justify-between border-b border-line py-2">
            <dt className="text-muted">{tab === "deposit" ? "Pool shares you get" : "Pool shares you give back"}</dt>
            <dd className="num text-ink">{fmt(shares, 4)}</dd>
          </div>
          <div className="flex justify-between border-b border-line py-2">
            <dt className="text-muted">Your money in the pool</dt>
            <dd className="num text-ink">${fmt(vault.yourAssetsUsd)}</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-muted">Your pool shares</dt>
            <dd className="num text-ink">{fmt(vault.yourShares, 4)}</dd>
          </div>
        </dl>

        <button type="button" className="btn-accent w-full" disabled={!valid || actions.busy} onClick={() => void submit()}>
          {tab === "deposit" ? "Put USDG in" : "Take USDG out"}
        </button>
        <p className="text-[12px] leading-snug text-faint">
          Cash that is out paying a dividend early is locked until the company pays it back. Everything else you can take out whenever you like.
        </p>
      </div>
    </section>
  );
}

function HowItEarns() {
  return (
    <Steps
      label="How the pool earns"
      title="How the pool earns"
      steps={[
        {
          h: "It pays what a company already owes",
          p: "Once a dividend is announced, the company owes a known amount on a known date. The pool pays the holder today and collects from the company on that date.",
        },
        {
          h: "Lenders earn 1% each time",
          p: "The fee is taken the moment the pool pays someone early. It goes straight to the people who put cash in the pool, so their share of the pool is worth more right away.",
        },
        {
          h: "Two limits keep it safe",
          p: "The pool never lends out more than 80% of what it holds. And it always keeps enough cash on hand to pay everyone it has promised to pay. Boring on purpose.",
        },
      ]}
    />
  );
}
