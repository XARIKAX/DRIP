"use client";

import { useState } from "react";
import { AnimatedNumber, LiveCounter, fmt } from "@/components/live";
import { Meter } from "@/components/charts";
import { TokenMark } from "@/components/TokenMark";
import { useCreditView, useDataActions, useHoldings, useWalletView } from "@/lib/data/provider";

/**
 * The credit side. Stocks are the collateral, dividends are the repayment engine.
 * The page leads with the number the whole product exists for: net carry — what the
 * collateral's dividends earn versus what the debt costs.
 */
export default function BorrowPage() {
  return (
    <div className="rise-group space-y-10">
      <header className="max-w-2xl border-b border-line pb-8">
        <div className="eyebrow">The credit side</div>
        <h1 className="mt-4 text-display font-black tracking-cut text-lit">Borrow</h1>
        <p className="mt-5 text-[16px] leading-relaxed text-muted">
          Draw USDG against your holdings without selling a share. The dividends your
          collateral keeps earning are applied against the interest automatically. At a
          conservative loan, they cover it.
        </p>
      </header>

      <CreditStrip />

      <div className="grid gap-8 lg:grid-cols-3">
        <CarryPanel />
        <BorrowPanel />
      </div>

      <HowItWorks />
    </div>
  );
}

function CreditStrip() {
  const c = useCreditView();
  const ltvPct = c.collateralValueUsd > 0 ? (c.borrowedUsd / c.collateralValueUsd) * 100 : 0;

  return (
    <section className="panel" aria-label="Credit line">
      <div className="grid grid-cols-2 gap-px bg-panel-line lg:grid-cols-4">
        <div className="bg-panel p-6">
          <div className="panel-title">Collateral</div>
          <div className="mt-3 text-[clamp(24px,2.4vw,34px)] font-semibold tracking-tighter text-panel-text">
            <AnimatedNumber value={c.collateralValueUsd} decimals={0} prefix="$" flash="dark" />
          </div>
          <div className="mt-1 text-[12px] text-panel-muted">Your deposited stocks, at Chainlink prices</div>
        </div>
        <div className="bg-panel p-6">
          <div className="panel-title">Borrowed</div>
          <div className="mt-3 text-[clamp(24px,2.4vw,34px)] font-semibold tracking-tighter text-panel-text">
            <AnimatedNumber value={c.borrowedUsd} decimals={0} prefix="$" flash="dark" />
          </div>
          <div className="mt-1 text-[12px] text-panel-muted">
            of ${fmt(c.maxBorrowUsd, 0)} available at {c.maxLtvPct.toFixed(0)}% LTV
          </div>
        </div>
        <div className="bg-panel p-6">
          <div className="panel-title">Health factor</div>
          <div className={`mt-3 text-[clamp(24px,2.4vw,34px)] font-semibold tracking-tighter ${c.healthFactor < 1.2 ? "text-down" : "text-cyan"}`}>
            {Number.isFinite(c.healthFactor) ? <AnimatedNumber value={c.healthFactor} decimals={2} flash="dark" /> : "∞"}
          </div>
          <div className="mt-3">
            <Meter pct={ltvPct} capPct={c.liqThresholdPct} />
          </div>
          <div className="mt-1.5 flex justify-between text-micro font-bold uppercase text-panel-faint">
            <span className="num">{ltvPct.toFixed(1)}% drawn</span>
            <span>Liq at {c.liqThresholdPct.toFixed(0)}%</span>
          </div>
        </div>
        <div className="bg-panel p-6">
          <div className="panel-title">Net carry / year</div>
          <div className={`mt-3 text-[clamp(24px,2.4vw,34px)] font-semibold tracking-tighter ${c.netCarryPerYearUsd >= 0 ? "text-cyan" : "text-down"}`}>
            <AnimatedNumber value={Math.abs(c.netCarryPerYearUsd)} decimals={0} prefix={c.netCarryPerYearUsd >= 0 ? "+$" : "-$"} flash="dark" />
          </div>
          <div className="mt-1 text-[12px] text-panel-muted">Dividends earned minus interest owed</div>
        </div>
      </div>
    </section>
  );
}

function CarryPanel() {
  const c = useCreditView();

  return (
    <section className="panel lg:col-span-2" aria-label="Your carry">
      <div className="panel-head">
        <span className="panel-title">Your carry</span>
        <span className="text-micro font-bold uppercase text-panel-faint">Dividends vs interest, live</span>
      </div>

      <div className="grid gap-px bg-panel-line sm:grid-cols-2">
        <div className="bg-panel p-6">
          <div className="panel-title">Dividends your collateral earns</div>
          <div className="num mt-3 text-[26px] font-semibold tracking-tighter text-cyan">
            +${fmt(c.dividendsPerYearUsd)} <span className="text-[13px] text-panel-muted">/ year</span>
          </div>
        </div>
        <div className="bg-panel p-6">
          <div className="panel-title">Interest your debt costs</div>
          <div className="num mt-3 text-[26px] font-semibold tracking-tighter text-panel-text">
            -${fmt(c.interestPerYearUsd)} <span className="text-[13px] text-panel-muted">/ year at {c.borrowAprPct.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      <div className="border-t border-panel-line px-6 py-5">
        <div className="panel-title">Interest serviced by dividends since the loan opened</div>
        <div className="mt-2 text-[clamp(24px,2.6vw,36px)] font-semibold tracking-tighter text-cyan">
          <LiveCounter base={c.servicedBaseUsd} ratePerSec={c.servicedRatePerSec} decimals={4} prefix="$" />
        </div>
        <p className="mt-3 max-w-lg text-[13px] leading-relaxed text-panel-muted">
          Every dividend your collateral earns is applied against interest first. While the
          cyan number above outruns your rate, the loan carries itself: you spend the USDG
          and keep every share.
        </p>
      </div>
    </section>
  );
}

function BorrowPanel() {
  const c = useCreditView();
  const wallet = useWalletView();
  const actions = useDataActions();
  const [tab, setTab] = useState<"borrow" | "repay">("borrow");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const usd = Number.parseFloat(amount) || 0;
  const max = tab === "borrow" ? c.availableUsd : Math.min(c.borrowedUsd, wallet.usdg);
  const valid = usd > 0 && usd <= max;

  async function submit() {
    if (!valid) return;
    setError(null);
    try {
      if (tab === "borrow") await actions.borrow(usd);
      else await actions.repay(usd);
      setAmount("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  return (
    <section className="panel self-start" aria-label="Borrow or repay">
      <div className="grid grid-cols-2" role="tablist" aria-label="Borrow or repay">
        {(["borrow", "repay"] as const).map((t) => (
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
          <span>{tab === "borrow" ? "Available to draw" : "Repayable now"}</span>
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
            <dt className="text-panel-muted">Rate</dt>
            <dd className="num text-panel-text">{c.borrowAprPct.toFixed(1)}% APR</dd>
          </div>
          <div className="flex justify-between border-b border-panel-line py-2">
            <dt className="text-panel-muted">USDG in wallet</dt>
            <dd className="num text-panel-text">${fmt(wallet.usdg)}</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-panel-muted">Liquidation threshold</dt>
            <dd className="num text-panel-text">{c.liqThresholdPct.toFixed(0)}% LTV</dd>
          </div>
        </dl>

        <button type="button" className="btn-accent w-full" disabled={!valid || actions.busy} onClick={() => void submit()}>
          {tab === "borrow" ? "Borrow USDG" : "Repay USDG"}
        </button>
        {error ? <p className="text-[12px] text-down">{error}</p> : null}
        <p className="text-[12px] leading-snug text-panel-faint">
          No fixed term. Repay whenever, or let the dividends chip away at it. Liquidation
          only if your loan passes {c.liqThresholdPct.toFixed(0)} percent of collateral value.
        </p>
      </div>
    </section>
  );
}

function HowItWorks() {
  const holdings = useHoldings();
  const rows = [
    {
      n: "01",
      h: "Your stocks stay yours",
      p: "Collateral sits in the same custody as your dividend positions. It keeps earning, streaming and compounding while it backs the loan.",
    },
    {
      n: "02",
      h: "Dividends pay the interest first",
      p: "Every dividend the collateral earns is applied against interest before anything else. At a conservative LTV, the yield covers the whole rate.",
    },
    {
      n: "03",
      h: "Priced by Chainlink, bounded by the cap",
      p: "Collateral is valued by the same Chainlink feeds that price every listing, and the borrow cap sits far below the liquidation line on purpose.",
    },
  ];
  return (
    <section aria-label="How borrowing works" className="space-y-6">
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

      {holdings.rows.length > 0 ? (
        <div className="border border-panel-line">
          <div className="flex items-baseline justify-between border-b border-panel-line px-5 py-3">
            <span className="eyebrow">Your collateral</span>
            <span className="text-micro font-bold uppercase text-panel-muted">Keeps earning while pledged</span>
          </div>
          <div className="grid grid-cols-2 gap-px bg-panel-3 p-px sm:grid-cols-3 lg:grid-cols-6">
            {holdings.rows.map((h) => (
              <div key={h.symbol} className="bg-paper p-4">
                <div className="flex items-center gap-2">
                  <TokenMark symbol={h.symbol} size={24} />
                  <span className="text-[13px] font-extrabold tracking-tight">{h.symbol}</span>
                </div>
                <div className="num mt-2 text-[13px] font-semibold">${fmt(h.valueUsd, 0)}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
