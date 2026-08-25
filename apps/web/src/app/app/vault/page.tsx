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
      <header className="max-w-2xl">
        <div className="eyebrow text-cyan-dark">The other side of early</div>
        <h1 className="mt-2 text-headline font-extrabold">Advance vault</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink/80">
          Somebody has to front the money three weeks early. This is where it comes from. Deposit
          USDG, earn the advance fee, get repaid when the issuer pays.
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
          <div className="panel-title">Total value locked</div>
          <div className="mt-3 text-[clamp(24px,2.4vw,34px)] font-semibold tracking-tighter text-paper">
            <AnimatedNumber value={vault.tvlUsd} decimals={0} prefix="$" flash="dark" />
          </div>
          <div className="mt-1 text-[12px] text-panel-muted">USDG from liquidity providers</div>
        </div>
        <div className="bg-panel p-6">
          <div className="panel-title">Current APY</div>
          <div className="mt-3 text-[clamp(24px,2.4vw,34px)] font-semibold tracking-tighter text-cyan">
            <AnimatedNumber value={vault.apyPct} decimals={2} suffix="%" flash="dark" />
          </div>
          <div className="mt-1 text-[12px] text-panel-muted">Annualised from advance fees</div>
        </div>
        <div className="bg-panel p-6">
          <div className="panel-title">Utilisation</div>
          <div className="mt-3 text-[clamp(24px,2.4vw,34px)] font-semibold tracking-tighter text-paper">
            <AnimatedNumber value={vault.utilizationPct} decimals={1} suffix="%" flash="dark" />
          </div>
          <div className="mt-3">
            <Meter pct={vault.utilizationPct} capPct={vault.capPct} />
          </div>
          <div className="mt-1.5 flex justify-between text-micro font-bold uppercase text-panel-faint">
            <span>Lent out</span>
            <span>Cap {vault.capPct.toFixed(0)}%</span>
          </div>
        </div>
        <div className="bg-panel p-6">
          <div className="panel-title">Advances outstanding</div>
          <div className="mt-3 text-[clamp(24px,2.4vw,34px)] font-semibold tracking-tighter text-paper">
            <AnimatedNumber value={vault.advancesOutstandingUsd} decimals={0} prefix="$" flash="dark" />
          </div>
          <div className="mt-1 text-[12px] text-panel-muted">Owed back by issuers at pay dates</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-px border-t border-panel-line bg-panel-line">
        {[
          { label: "Free liquidity", value: `$${fmt(vault.freeLiquidityUsd, 0)}` },
          { label: "Fees earned, lifetime", value: `$${fmt(vault.feesEarnedUsd, 0)}` },
          { label: "Share price", value: fmt(vault.sharePrice, 4) },
        ].map((s) => (
          <div key={s.label} className="bg-panel px-6 py-4">
            <div className="panel-title">{s.label}</div>
            <div className="num mt-1.5 text-[17px] font-medium text-paper">{s.value}</div>
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
        <span className="panel-title">APY · last 90 days</span>
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
              tab === t ? "border-cyan text-cyan" : "border-panel-line text-panel-muted hover:text-paper"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="space-y-4 p-5">
        <div className="flex items-baseline justify-between text-micro font-bold uppercase text-panel-muted">
          <span>{tab === "deposit" ? "USDG in wallet" : "Withdrawable now"}</span>
          <span className="num">${fmt(max)}</span>
        </div>
        <div className="flex gap-2">
          <input
            className="num w-full border border-panel-edge bg-panel-2 px-4 py-3 text-[16px] text-paper outline-none placeholder:text-panel-faint focus:border-cyan"
            inputMode="decimal"
            placeholder="0.00"
            aria-label={`USDG to ${tab}`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button
            type="button"
            className="border border-panel-edge px-3 text-micro font-bold uppercase text-panel-muted hover:text-paper"
            onClick={() => setAmount(max > 0 ? max.toFixed(2) : "")}
          >
            Max
          </button>
        </div>

        <dl className="text-[13px]">
          <div className="flex justify-between border-b border-panel-line py-2">
            <dt className="text-panel-muted">{tab === "deposit" ? "Shares received" : "Shares redeemed"}</dt>
            <dd className="num text-paper">{fmt(shares, 4)}</dd>
          </div>
          <div className="flex justify-between border-b border-panel-line py-2">
            <dt className="text-panel-muted">Your position</dt>
            <dd className="num text-paper">${fmt(vault.yourAssetsUsd)}</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-panel-muted">Your shares</dt>
            <dd className="num text-paper">{fmt(vault.yourShares, 4)}</dd>
          </div>
        </dl>

        <button type="button" className="btn-accent w-full" disabled={!valid || actions.busy} onClick={() => void submit()}>
          {tab === "deposit" ? "Deposit USDG" : "Withdraw USDG"}
        </button>
        <p className="text-[12px] leading-snug text-panel-faint">
          Capital fronting a dividend is illiquid until the issuer settles. Everything else leaves whenever you ask.
        </p>
      </div>
    </section>
  );
}

function HowItEarns() {
  const rows = [
    {
      n: "01",
      h: "It fronts a receivable, not a loan",
      p: "When a dividend goes ex, the issuer owes a known amount on a known date. The vault pays the holder now and collects from the issuer then.",
    },
    {
      n: "02",
      h: "The fee lands when the risk does",
      p: "One percent is taken the moment an advance is booked, not when it is repaid. Share price moves immediately.",
    },
    {
      n: "03",
      h: "Two limits keep it boring",
      p: "Advances never pass eighty percent of assets, and the vault never owes streamers more cash than it holds. Boring is the product.",
    },
  ];
  return (
    <section aria-label="How the vault earns">
      <div className="eyebrow text-cyan-dark">How the vault earns</div>
      <div className="mt-4">
        {rows.map((r) => (
          <div key={r.n} className="hairline-t grid gap-2 py-5 md:grid-cols-12 md:gap-6">
            <div className="num text-micro font-bold text-cyan-dark md:col-span-1">{r.n}</div>
            <h3 className="text-[17px] font-extrabold tracking-tight md:col-span-4">{r.h}</h3>
            <p className="text-[14px] leading-relaxed text-muted md:col-span-7">{r.p}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
