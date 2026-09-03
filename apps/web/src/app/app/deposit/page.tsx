"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatedNumber, fmt, relativeTime, shortDate } from "@/components/live";
import { TokenMark } from "@/components/TokenMark";
import { useDataActions, useHoldings, useTokensView, useWalletView } from "@/lib/data/provider";
import { MODE_LABEL, MODE_SENTENCE, type ModeName } from "@/lib/data/types";

const MODES: ModeName[] = ["CASH_EARLY", "STREAM", "REINVEST"];

/**
 * Three steps, one screen, no wizard chrome. Pick the token, type the amount,
 * pick the mode, confirm against the receipt. In demo mode the deposit lands
 * instantly and shows up on the dashboard.
 */
export default function DepositPage() {
  const tokens = useTokensView();
  const wallet = useWalletView();
  const holdings = useHoldings();
  const actions = useDataActions();

  const [symbol, setSymbol] = useState("AAPL");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<ModeName>("STREAM");
  const [placed, setPlaced] = useState<null | { symbol: string; shares: number; mode: ModeName }>(null);

  const token = tokens.find((t) => t.symbol === symbol) ?? tokens[0];
  const walletShares = token ? (wallet.stocks[token.symbol] ?? 0) : 0;
  const shares = Number.parseFloat(amount) || 0;
  const tooMuch = shares > walletShares;
  const valid = Boolean(token) && shares > 0 && !tooMuch;
  const existing = holdings.rows.find((h) => h.symbol === token?.symbol);

  async function submit() {
    if (!token || !valid) return;
    await actions.deposit(token.symbol, shares, mode);
    setPlaced({ symbol: token.symbol, shares, mode });
    setAmount("");
  }

  return (
    <div className="rise-group space-y-10">
      <header className="max-w-2xl border-b border-line pb-8">
        <div className="serial">Step one</div>
        <h1 className="mt-4 display text-display">Deposit a stock</h1>
        <p className="mt-5 text-[16px] leading-relaxed text-muted">
          Your stock has to be in Osinko before a dividend&apos;s ex date for that dividend to count.
          Deposit once and pick a rule. Every dividend after that arrives early, a little every
          second, or as more stock.
        </p>
      </header>

      {placed ? (
        <div className="border border-cyan/30 bg-cyan-soft px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[14px]">
              <span className="font-extrabold">{fmt(placed.shares, 4)} {placed.symbol}</span> is in, set to{" "}
              <span className="font-extrabold">{MODE_LABEL[placed.mode]}</span>. It is already on your dashboard.
            </p>
            <Link href="/app" className="btn-primary btn-sm">
              View dashboard
            </Link>
          </div>
        </div>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-12">
        <div className="space-y-8 lg:col-span-7">
          {/* Step 1: the token */}
          <section className="panel" aria-label="Pick a token">
            <div className="flex items-baseline justify-between border-b border-panel-line px-5 py-4">
              <span className="eyebrow text-cyan">01 — Pick a stock</span>
              <span className="text-micro font-bold uppercase text-panel-muted">Price · yield · next ex date</span>
            </div>
            <div className="grid grid-cols-1 gap-px bg-panel-line sm:grid-cols-2">
              {tokens.map((t, i) => {
                const active = t.symbol === token?.symbol;
                const spansRow = tokens.length % 2 === 1 && i === tokens.length - 1;
                return (
                  <button
                    key={t.symbol}
                    type="button"
                    onClick={() => setSymbol(t.symbol)}
                    aria-pressed={active}
                    className={`flex items-center gap-3 p-4 text-left transition-colors duration-150 ${
                      spansRow ? "sm:col-span-2" : ""
                    } ${
                      active
                        ? "bg-panel-3 text-panel-text shadow-[inset_2px_0_0_0_#35C2DB]"
                        : "bg-panel text-panel-muted hover:bg-panel-2"
                    }`}
                  >
                    <TokenMark symbol={t.symbol} dark={active} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-[15px] font-extrabold tracking-tight">{t.symbol}</span>
                        <span className="num text-[13px]">${fmt(t.priceUsd)}</span>
                      </span>
                      <span className={`mt-0.5 flex items-baseline justify-between gap-2 text-micro font-bold uppercase ${active ? "text-panel-text/60" : "text-panel-muted"}`}>
                        <span>{t.yieldPct.toFixed(2)}% yield</span>
                        <span>{t.nextExDate ? `Ex ${shortDate(t.nextExDate)}` : t.payingNow ? "Paying now" : "None set"}</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Step 2: the amount */}
          <section className="panel card-pad" aria-label="Amount">
            <div className="flex items-baseline justify-between">
              <span className="eyebrow text-cyan">02 — How many shares</span>
              <span className="num text-micro font-bold uppercase text-panel-muted">
                Wallet {fmt(walletShares, 4)} {token?.symbol}
              </span>
            </div>
            <div className="mt-4 flex gap-3">
              <input
                className="field num text-[18px]"
                inputMode="decimal"
                placeholder="0.0000"
                aria-label={`Amount of ${token?.symbol} to deposit`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <button type="button" className="btn-ghost" onClick={() => setAmount(String(walletShares))}>
                Max
              </button>
            </div>
            <div className="mt-3 flex items-baseline justify-between text-[13px]">
              {tooMuch ? (
                <span className="text-down">More than this wallet holds.</span>
              ) : (
                <span className="text-panel-muted">
                  ≈ <AnimatedNumber value={shares * (token?.priceUsd ?? 0)} prefix="$" flash="light" /> USD
                </span>
              )}
              {walletShares === 0 && token ? (
                <button type="button" className="text-micro font-bold uppercase underline decoration-cyan decoration-2 underline-offset-4" onClick={() => void actions.faucet(token.symbol)}>
                  Get test {token.symbol}
                </button>
              ) : null}
            </div>
          </section>

          {/* Step 3: the mode */}
          <section className="panel" aria-label="Pick a mode">
            <div className="border-b border-panel-line px-5 py-4">
              <span className="eyebrow text-cyan">03 — What should its dividends do</span>
            </div>
            <div className="grid grid-cols-1 gap-px bg-panel-line md:grid-cols-3">
              {MODES.map((m) => {
                const active = mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setMode(m)}
                    className={`p-5 text-left transition-colors duration-300 ${
                      active
                        ? "bg-panel-3 text-panel-text shadow-[inset_0_2px_0_0_#35C2DB]"
                        : "bg-panel text-panel-muted hover:bg-panel-2"
                    }`}
                  >
                    <span className="flex items-center justify-between">
                      <span className="text-[15px] font-extrabold tracking-tight">{MODE_LABEL[m]}</span>
                      <span className={`block h-3 w-3 border ${active ? "border-cyan bg-cyan" : "border-panel-line"}`} aria-hidden />
                    </span>
                    <span className={`mt-2 block text-[13px] leading-snug ${active ? "text-panel-text/70" : "text-panel-muted"}`}>
                      {MODE_SENTENCE[m]}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* The receipt */}
        <div className="space-y-8 lg:col-span-5">
          <section className="panel" aria-label="Summary">
            <div className="panel-head">
              <span className="panel-title">Check it over</span>
              <span className="text-micro font-bold uppercase text-panel-faint">Before you confirm</span>
            </div>
            <dl className="px-5 py-4 text-[14px]">
              {[
                ["Stock", token ? `${token.symbol} — ${token.name}` : "—"],
                ["Shares", `${fmt(shares, 4)}`],
                ["Worth", `$${fmt(shares * (token?.priceUsd ?? 0))}`],
                ["Dividends will", MODE_LABEL[mode]],
                ["Next ex date", token?.nextExDate ? `${shortDate(token.nextExDate)} (${relativeTime(token.nextExDate)})` : "None set"],
                ["Next payout, about", token ? `$${fmt(shares * token.perShare)}` : "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between border-b border-panel-line py-2.5 last:border-b-0">
                  <dt className="text-micro font-bold uppercase text-panel-muted">{k}</dt>
                  <dd className="num text-right font-medium text-panel-text">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="px-5 pb-5">
              <button type="button" className="btn-accent w-full" disabled={!valid || actions.busy} onClick={() => void submit()}>
                Confirm deposit
              </button>
              <p className="mt-3 text-[12px] text-panel-faint">
                Your deposit is on the record the second it lands. Any dividend with an ex date after that is yours.
              </p>
            </div>
          </section>

          <WithdrawPanel />
        </div>
      </div>
    </div>
  );
}

function WithdrawPanel() {
  const holdings = useHoldings();
  const actions = useDataActions();
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  if (holdings.rows.length === 0) return null;

  return (
    <section className="panel" aria-label="Withdraw">
      <div className="border-b border-panel-line px-5 py-4">
        <span className="serial">Take stock out</span>
      </div>
      <div className="px-5 py-4">
        {holdings.rows.map((h) => {
          const value = amounts[h.symbol] ?? "";
          const shares = Number.parseFloat(value) || 0;
          const valid = shares > 0 && shares <= h.amount;
          return (
            <div key={h.symbol} className="hairline-b py-3 last:border-b-0">
              <div className="flex items-baseline justify-between">
                <span className="text-[14px] font-extrabold tracking-tight">{h.symbol}</span>
                <span className="num text-[12px] text-panel-muted">{fmt(h.amount, 4)} in Osinko</span>
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  className="field num py-2 text-[13px]"
                  inputMode="decimal"
                  placeholder="0.0000"
                  aria-label={`Amount of ${h.symbol} to withdraw`}
                  value={value}
                  onChange={(e) => setAmounts((a) => ({ ...a, [h.symbol]: e.target.value }))}
                />
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  disabled={!valid || actions.busy}
                  onClick={() => {
                    void actions.withdraw(h.symbol, shares);
                    setAmounts((a) => ({ ...a, [h.symbol]: "" }));
                  }}
                >
                  Withdraw
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
