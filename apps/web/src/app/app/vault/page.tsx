"use client";

import { useState } from "react";
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
  const { vault } = useVaultView();

  return (
    <section className="panel" aria-label="Vault statistics">
      <div className="grid grid-cols-2 gap-px bg-panel-line lg:grid-cols-4">
        <div className="bg-panel p-6">
          <div className="panel-title">In the pool</div>
          <div className="mt-3 text-[clamp(24px,2.4vw,34px)] font-semibold tracking-tighter text-panel-text">
            <AnimatedNumber value={vault.tvlUsd} decimals={0} prefix="$" flash="dark" />
          </div>
          <div className="mt-1 text-[12px] text-panel-muted">USDG put in by lenders</div>
        </div>
        <div className="bg-panel p-6">
          <div className="panel-title">Yearly return</div>
          <div className="mt-3 text-[clamp(24px,2.4vw,34px)] font-semibold tracking-tighter text-cyan">
            <AnimatedNumber value={vault.apyPct} decimals={2} suffix="%" flash="dark" />
          </div>
          <div className="mt-1 text-[12px] text-panel-muted">From the 1% fee and loan interest</div>
        </div>
        <div className="bg-panel p-6">
          <div className="panel-title">Lent out</div>
          <div className="mt-3 text-[clamp(24px,2.4vw,34px)] font-semibold tracking-tighter text-panel-text">
            <AnimatedNumber value={vault.utilizationPct} decimals={1} suffix="%" flash="dark" />
          </div>
          <div className="mt-3">
            <Meter pct={vault.utilizationPct} capPct={vault.capPct} />
          </div>
          <div className="mt-1.5 flex justify-between text-micro font-bold uppercase text-panel-faint">
            <span>Of the pool</span>
            <span>Limit {vault.capPct.toFixed(0)}%</span>
          </div>
        </div>
        <div className="bg-panel p-6">
          <div className="panel-title">Paid out early</div>
          <div className="mt-3 text-[clamp(24px,2.4vw,34px)] font-semibold tracking-tighter text-panel-text">
            <AnimatedNumber value={vault.advancesOutstandingUsd} decimals={0} prefix="$" flash="dark" />
          </div>
          <div className="mt-1 text-[12px] text-panel-muted">Companies pay this back on their pay dates</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-px border-t border-panel-line bg-panel-line">
        {[
          { label: "Cash available now", value: `$${fmt(vault.freeLiquidityUsd, 0)}` },
          { label: "Fees earned so far", value: `$${fmt(vault.feesEarnedUsd, 0)}` },
          { label: "Value of one pool share", value: fmt(vault.sharePrice, 4) },
        ].map((s) => (
          <div key={s.label} className="bg-panel px-6 py-4">
            <div className="panel-title">{s.label}</div>
            <div className="num mt-1.5 text-[17px] font-medium text-panel-text">{s.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function YieldChart() {
  const { vault } = useVaultView();
  return (
    <section className="panel lg:col-span-2" aria-label="Yield history">
      <div className="panel-head">
        <span className="panel-title">Yearly return · last 90 days</span>
        <span className="num text-micro font-bold uppercase text-cyan">{vault.apyPct.toFixed(2)}% now</span>
      </div>
      <div className="p-5">
        <AreaChart
          points={vault.apyHistory}
          labelLeft="90 days ago"
          labelRight="Today"
          formatValue={(v) => `${v.toFixed(1)}%`}
        />
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
              tab === t ? "border-cyan text-cyan" : "border-panel-line text-panel-muted hover:text-panel-text"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="space-y-4 p-5">
        <div className="flex items-baseline justify-between text-micro font-bold uppercase text-panel-muted">
          <span>{tab === "deposit" ? "USDG in your wallet" : "You can take out"}</span>
          <span className="num">${fmt(max)}</span>
        </div>
        <div className="flex gap-2">
          <input
            className="num w-full border border-panel-line bg-panel-2 px-4 py-3 text-[16px] text-panel-text outline-none placeholder:text-panel-faint focus:border-cyan"
            inputMode="decimal"
            placeholder="0.00"
            aria-label={`USDG to ${tab}`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button
            type="button"
            className="border border-panel-line px-3 text-micro font-bold uppercase text-panel-muted hover:text-panel-text"
            onClick={() => setAmount(max > 0 ? max.toFixed(2) : "")}
          >
            Max
          </button>
        </div>

        <dl className="text-[13px]">
          <div className="flex justify-between border-b border-panel-line py-2">
            <dt className="text-panel-muted">{tab === "deposit" ? "Pool shares you get" : "Pool shares you give back"}</dt>
            <dd className="num text-panel-text">{fmt(shares, 4)}</dd>
          </div>
          <div className="flex justify-between border-b border-panel-line py-2">
            <dt className="text-panel-muted">Your money in the pool</dt>
            <dd className="num text-panel-text">${fmt(vault.yourAssetsUsd)}</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-panel-muted">Your pool shares</dt>
            <dd className="num text-panel-text">{fmt(vault.yourShares, 4)}</dd>
          </div>
        </dl>

        <button type="button" className="btn-accent w-full" disabled={!valid || actions.busy} onClick={() => void submit()}>
          {tab === "deposit" ? "Put USDG in" : "Take USDG out"}
        </button>
        <p className="text-[12px] leading-snug text-panel-faint">
          Cash that is out paying a dividend early is locked until the company pays it back. Everything else you can take out whenever you like.
        </p>
      </div>
    </section>
  );
}

function HowItEarns() {
  const rows = [
    {
      n: "01",
      h: "It pays what a company already owes",
      p: "Once a dividend is announced, the company owes a known amount on a known date. The pool pays the holder today and collects from the company on that date.",
    },
    {
      n: "02",
      h: "Lenders earn 1% each time",
      p: "The fee is taken the moment the pool pays someone early. It goes straight to the people who put cash in the pool, so their share of the pool is worth more right away.",
    },
    {
      n: "03",
      h: "Two limits keep it safe",
      p: "The pool never lends out more than 80% of what it holds. And it always keeps enough cash on hand to pay everyone it has promised to pay. Boring on purpose.",
    },
  ];
  return (
    <section aria-label="How the pool earns">
      <div className="eyebrow text-cyan">How the pool earns</div>
      <div className="mt-4">
        {rows.map((r) => (
          <div key={r.n} className="hairline-t grid gap-2 py-5 md:grid-cols-12 md:gap-6">
            <div className="num text-micro font-bold text-cyan md:col-span-1">{r.n}</div>
            <h3 className="text-[17px] font-extrabold tracking-tight md:col-span-4">{r.h}</h3>
            <p className="text-[14px] leading-relaxed text-panel-muted md:col-span-7">{r.p}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
