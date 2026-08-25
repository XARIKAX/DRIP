"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import type { Address } from "viem";
import {
  MODE_DESCRIPTIONS,
  MODE_LABELS,
  Mode,
  buildApprove,
  buildDeposit,
  buildSetMode,
  buildStockFaucet,
  buildWithdraw,
  formatStock,
  formatUsdg,
  parseStock,
} from "@drip/sdk";
import { Card, Empty, Eyebrow, Loading, SectionHead } from "@/components/ui";
import { ConnectGate } from "@/components/ConnectGate";
import { TxBar } from "@/components/TxBar";
import { useDeployment, usePositions, useStockTokens, useWalletBalances } from "@/lib/hooks";
import { useTxRunner } from "@/lib/tx";

export default function DepositPage() {
  return (
    <div className="space-y-12">
      <header className="max-w-2xl">
        <Eyebrow className="text-cyan-dark">Custody</Eyebrow>
        <h1 className="mt-3 text-display font-extrabold">Deposit stock</h1>
        <p className="mt-5 text-[16px] leading-relaxed text-ink/80">
          Only tokens held in DRIP before an ex date are eligible. Deposit once, pick a mode, and
          every dividend after that arrives early, per second, or as more stock.
        </p>
      </header>
      <ConnectGate>
        <DepositBody />
      </ConnectGate>
    </div>
  );
}

function DepositBody() {
  const { address } = useAccount();
  const deployment = useDeployment();
  const tokens = useStockTokens();
  const balances = useWalletBalances();
  const positions = usePositions();
  const { state, run, reset } = useTxRunner();

  const [selected, setSelected] = useState<Address | null>(null);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<Mode>(Mode.STREAM);

  const token = useMemo(
    () => (tokens.data ?? []).find((t) => t.address === selected) ?? (tokens.data ?? [])[0],
    [tokens.data, selected]
  );

  const walletBalance = token ? (balances.data?.stocks[token.address] ?? 0n) : 0n;
  const parsed = parseStock(amount);
  const tooMuch = parsed > walletBalance;
  const canSubmit = Boolean(deployment && token && parsed > 0n && !tooMuch);

  const existing = (positions.data ?? []).find((p) => p.stockToken === token?.address);

  async function submit() {
    if (!deployment || !token || !canSubmit) return;
    const txs = [
      buildApprove(token.address, deployment.dripCore, parsed, token.symbol),
      buildDeposit(deployment, token.address, parsed, token.symbol),
    ];
    // Only write the mode when it is not already what the position says.
    if (!existing || existing.mode !== mode) {
      txs.push(buildSetMode(deployment, token.address, mode, token.symbol));
    }
    const ok = await run(txs);
    if (ok) setAmount("");
  }

  if (tokens.isLoading) return <Loading label="Reading supported tokens" />;
  if ((tokens.data ?? []).length === 0) {
    return <Empty title="No tokens yet" body="The registry has no supported stock tokens on this chain." />;
  }

  return (
    <div className="space-y-12">
      <TxBar state={state} onDismiss={reset} />

      <div className="grid gap-10 lg:grid-cols-12">
        <div className="space-y-8 lg:col-span-7">
          {/* Step 1 */}
          <Card>
            <div className="flex items-baseline justify-between">
              <Eyebrow className="text-cyan-dark">Step 01</Eyebrow>
              <span className="text-micro font-bold uppercase text-muted">Pick a token</span>
            </div>

            <div className="mt-5 grid gap-px border border-ink bg-ink sm:grid-cols-2">
              {(tokens.data ?? []).map((t) => {
                const active = t.address === token?.address;
                return (
                  <button
                    key={t.address}
                    type="button"
                    onClick={() => setSelected(t.address)}
                    className={`flex items-baseline justify-between p-4 text-left transition-colors ${
                      active ? "bg-ink text-paper" : "bg-paper hover:bg-cyan"
                    }`}
                  >
                    <span className="text-lg font-extrabold tracking-tighter">{t.symbol}</span>
                    <span className="num text-[13px] opacity-70">${formatUsdg(t.priceUsdg)}</span>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Step 2 */}
          <Card>
            <div className="flex items-baseline justify-between">
              <Eyebrow className="text-cyan-dark">Step 02</Eyebrow>
              <span className="text-micro font-bold uppercase text-muted">
                Wallet: {formatStock(walletBalance)} {token?.symbol}
              </span>
            </div>

            <div className="mt-5 flex gap-3">
              <input
                className="field num"
                inputMode="decimal"
                placeholder="0.0000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setAmount((Number(walletBalance) / 1e18).toString())}
              >
                Max
              </button>
            </div>

            {tooMuch ? (
              <p className="mt-3 text-[13px] text-down">More than this wallet holds.</p>
            ) : (
              <p className="mt-3 text-[13px] text-muted">
                Value: ${formatUsdg((parsed * (token?.priceUsdg ?? 0n)) / 10n ** 18n)}
              </p>
            )}

            {walletBalance === 0n && token ? (
              <button
                type="button"
                className="btn-accent btn-sm mt-5"
                onClick={() => void run([buildStockFaucet(token.address, token.symbol)])}
              >
                Get test {token.symbol}
              </button>
            ) : null}
          </Card>

          {/* Step 3 */}
          <Card>
            <div className="flex items-baseline justify-between">
              <Eyebrow className="text-cyan-dark">Step 03</Eyebrow>
              <span className="text-micro font-bold uppercase text-muted">Pick a mode</span>
            </div>

            <div className="mt-5 space-y-px border border-ink bg-ink">
              {[Mode.CASH_EARLY, Mode.STREAM, Mode.REINVEST].map((m) => {
                const active = m === mode;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`flex w-full items-start gap-4 p-5 text-left transition-colors ${
                      active ? "bg-ink text-paper" : "bg-paper hover:bg-wash"
                    }`}
                  >
                    <span
                      className={`mt-1 block h-3 w-3 shrink-0 border ${
                        active ? "border-cyan bg-cyan" : "border-ink"
                      }`}
                      aria-hidden
                    />
                    <span>
                      <span className="block text-[15px] font-extrabold tracking-tight">
                        {MODE_LABELS[m]}
                      </span>
                      <span className={`mt-1 block text-[13px] ${active ? "text-paper/70" : "text-muted"}`}>
                        {MODE_DESCRIPTIONS[m]}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <button type="button" className="btn-primary mt-7 w-full" disabled={!canSubmit} onClick={() => void submit()}>
              Approve and deposit
            </button>
            <p className="mt-3 text-[12px] text-muted">
              Two signatures, sometimes three. Approve the token, deposit it, set the mode if it changed.
            </p>
          </Card>
        </div>

        <div className="space-y-8 lg:col-span-5">
          <Card>
            <Eyebrow className="text-muted">What happens next</Eyebrow>
            <ol className="mt-5 space-y-5 text-[14px]">
              {[
                "Your balance is checkpointed the moment it lands. That checkpoint is the eligibility proof.",
                "When a dividend goes ex, your entitlement is computed from the balance you held at that second.",
                "The vault fronts the money and your mode decides where it goes.",
                "Withdraw whenever you like. Entitlements already created are yours to keep.",
              ].map((line, i) => (
                <li key={line} className="flex gap-4">
                  <span className="num text-micro font-bold text-cyan-dark">0{i + 1}</span>
                  <span className="text-muted">{line}</span>
                </li>
              ))}
            </ol>
          </Card>

          <Withdraw />
        </div>
      </div>
    </div>
  );
}

function Withdraw() {
  const deployment = useDeployment();
  const positions = usePositions();
  const { run } = useTxRunner();
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  const rows = positions.data ?? [];
  if (rows.length === 0) return null;

  return (
    <Card>
      <SectionHead eyebrow="Custody" title="Withdraw" />
      <div className="mt-6 space-y-5">
        {rows.map((p) => {
          const value = amounts[p.stockToken] ?? "";
          const parsed = parseStock(value);
          const valid = parsed > 0n && parsed <= p.amount;
          return (
            <div key={p.stockToken} className="border-b border-faint pb-5 last:border-b-0 last:pb-0">
              <div className="flex items-baseline justify-between">
                <span className="font-extrabold tracking-tight">{p.symbol}</span>
                <span className="num text-[13px] text-muted">{formatStock(p.amount)} on deposit</span>
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  className="field num py-2 text-[14px]"
                  inputMode="decimal"
                  placeholder="0.0000"
                  value={value}
                  onChange={(e) => setAmounts((a) => ({ ...a, [p.stockToken]: e.target.value }))}
                />
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  disabled={!valid || !deployment}
                  onClick={() =>
                    deployment && void run([buildWithdraw(deployment, p.stockToken, parsed, p.symbol)])
                  }
                >
                  Withdraw
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
