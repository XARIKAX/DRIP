"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import {
  buildApprove,
  buildUsdgFaucet,
  buildVaultDeposit,
  buildVaultWithdraw,
  formatBps,
  formatUsdg,
  parseUsdg,
} from "@drip/sdk";
import { estimateApyBps } from "@drip/sdk";
import { Card, Eyebrow, Loading, ErrorNote, SectionHead, Stat } from "@/components/ui";
import { ConnectGate } from "@/components/ConnectGate";
import { TxBar } from "@/components/TxBar";
import { useDeployment, useVaultPosition, useVaultStats, useWalletBalances } from "@/lib/hooks";
import { useTxRunner } from "@/lib/tx";

export default function VaultPage() {
  return (
    <div className="space-y-12">
      <header className="max-w-2xl">
        <Eyebrow className="text-cyan-dark">Module 01, the other side</Eyebrow>
        <h1 className="mt-3 text-display font-extrabold">Advance vault</h1>
        <p className="mt-5 text-[16px] leading-relaxed text-ink/80">
          Somebody has to front the money three weeks early. This is where it comes from. Deposit
          USDG, earn the advance fee, get repaid when the issuer pays.
        </p>
      </header>
      <VaultStats />
      <ConnectGate>
        <VaultActions />
      </ConnectGate>
      <Explainer />
    </div>
  );
}

function VaultStats() {
  const { data, isLoading, error, refetch } = useVaultStats();
  const deployment = useDeployment();

  if (isLoading) return <Loading label="Reading the vault" />;
  if (error) return <ErrorNote message={(error as Error).message} retry={() => void refetch()} />;
  if (!data) return null;

  const headroom = data.totalAssets === 0n ? 0n : data.maxUtilizationBps - data.utilizationBps;
  const secondsLive = deployment?.deployedAt
    ? Math.max(1, Math.floor(Date.now() / 1000) - deployment.deployedAt)
    : 0;
  const apyBps = estimateApyBps(data.totalFeesAccrued, data.totalAssets, secondsLive);

  return (
    <section className="space-y-6">
      <div className="grid gap-px border border-ink bg-ink sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-paper p-6">
          <Stat label="Total assets" value={`$${formatUsdg(data.totalAssets)}`} sub="Cash plus receivables minus obligations" />
        </div>
        <div className="bg-paper p-6">
          <Stat
            label="Utilisation"
            value={`${formatBps(data.utilizationBps)}%`}
            sub={`Cap ${formatBps(data.maxUtilizationBps, 0)}%`}
            accent
          />
        </div>
        <div className="bg-paper p-6">
          <Stat label="Advances outstanding" value={`$${formatUsdg(data.receivables)}`} sub="Owed by issuers at pay date" />
        </div>
        <div className="bg-paper p-6">
          <Stat
            label="Fee APY"
            value={`${formatBps(apyBps)}%`}
            sub={`$${formatUsdg(data.totalFeesAccrued)} lifetime fees, annualised`}
          />
        </div>
      </div>

      <div className="grid gap-px border border-ink bg-ink sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Idle cash", value: `$${formatUsdg(data.cash)}` },
          { label: "Free to withdraw", value: `$${formatUsdg(data.freeCash)}` },
          { label: "Owed to holders", value: `$${formatUsdg(data.obligations)}` },
          { label: "Share price", value: formatUsdg(data.sharePrice, 6) },
        ].map((s) => (
          <div key={s.label} className="bg-paper p-6">
            <div className="eyebrow text-muted">{s.label}</div>
            <div className="num mt-2 text-xl font-semibold tracking-tighter">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="border border-ink p-6">
        <div className="flex items-baseline justify-between">
          <div className="eyebrow text-muted">Utilisation against the cap</div>
          <div className="num text-[13px] font-semibold">
            {formatBps(data.utilizationBps)}% of {formatBps(data.maxUtilizationBps, 0)}%
          </div>
        </div>
        <div className="mt-4 h-2 w-full bg-faint">
          <div
            className="h-2 bg-cyan"
            style={{ width: `${Math.min(Number(data.utilizationBps) / 100, 100)}%` }}
          />
          <div
            className="relative -top-2 h-2 w-px bg-ink"
            style={{ marginLeft: `${Math.min(Number(data.maxUtilizationBps) / 100, 100)}%` }}
          />
        </div>
        <p className="mt-4 text-[13px] text-muted">
          {headroom > 0n
            ? `${formatBps(headroom)} percentage points of headroom before the vault stops fronting new dividends.`
            : "The vault is at its cap. New advances are refused until something settles."}
        </p>
      </div>
    </section>
  );
}

function VaultActions() {
  const { address } = useAccount();
  const deployment = useDeployment();
  const position = useVaultPosition();
  const balances = useWalletBalances();
  const { state, run, reset } = useTxRunner();

  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");

  const walletUsdg = balances.data?.usdg ?? 0n;
  const parsedDeposit = parseUsdg(depositAmount);
  const parsedWithdraw = parseUsdg(withdrawAmount);
  const maxWithdraw = position.data?.maxWithdraw ?? 0n;

  return (
    <section className="space-y-6">
      <TxBar state={state} onDismiss={reset} />
      <SectionHead eyebrow="Your stake" title="Deposit and withdraw" />

      <div className="grid gap-px border border-ink bg-ink lg:grid-cols-3">
        <div className="bg-paper p-6">
          <Stat label="Your shares" value={formatUsdg(position.data?.shares ?? 0n, 4)} />
        </div>
        <div className="bg-paper p-6">
          <Stat label="Your assets" value={`$${formatUsdg(position.data?.assets ?? 0n)}`} accent />
        </div>
        <div className="bg-paper p-6">
          <Stat label="Withdrawable now" value={`$${formatUsdg(maxWithdraw)}`} sub="Advanced capital is illiquid until settlement" />
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <Card>
          <Eyebrow className="text-cyan-dark">Deposit</Eyebrow>
          <div className="mt-2 text-[13px] text-muted">Wallet: ${formatUsdg(walletUsdg)} USDG</div>
          <div className="mt-5 flex gap-3">
            <input
              className="field num"
              inputMode="decimal"
              placeholder="0.00"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
            />
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setDepositAmount((Number(walletUsdg) / 1e6).toString())}
            >
              Max
            </button>
          </div>
          <button
            type="button"
            className="btn-primary mt-5 w-full"
            disabled={!deployment || !address || parsedDeposit === 0n || parsedDeposit > walletUsdg}
            onClick={() =>
              deployment &&
              address &&
              void run([
                buildApprove(deployment.usdg, deployment.advanceVault, parsedDeposit, "USDG"),
                buildVaultDeposit(deployment, parsedDeposit, address),
              ]).then((ok) => ok && setDepositAmount(""))
            }
          >
            Approve and deposit
          </button>
          {walletUsdg === 0n && deployment ? (
            <button
              type="button"
              className="btn-accent btn-sm mt-3 w-full"
              onClick={() => void run([buildUsdgFaucet(deployment)])}
            >
              Get test USDG
            </button>
          ) : null}
        </Card>

        <Card>
          <Eyebrow className="text-cyan-dark">Withdraw</Eyebrow>
          <div className="mt-2 text-[13px] text-muted">Available: ${formatUsdg(maxWithdraw)} USDG</div>
          <div className="mt-5 flex gap-3">
            <input
              className="field num"
              inputMode="decimal"
              placeholder="0.00"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
            />
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setWithdrawAmount((Number(maxWithdraw) / 1e6).toString())}
            >
              Max
            </button>
          </div>
          <button
            type="button"
            className="btn-primary mt-5 w-full"
            disabled={!deployment || !address || parsedWithdraw === 0n || parsedWithdraw > maxWithdraw}
            onClick={() =>
              deployment &&
              address &&
              void run([buildVaultWithdraw(deployment, parsedWithdraw, address, address)]).then(
                (ok) => ok && setWithdrawAmount("")
              )
            }
          >
            Withdraw
          </button>
          <p className="mt-3 text-[12px] text-muted">
            Capital currently fronting a dividend cannot be pulled. It comes back when the issuer pays.
          </p>
        </Card>
      </div>
    </section>
  );
}

function Explainer() {
  return (
    <section className="space-y-6">
      <SectionHead eyebrow="Mechanics" title="How the vault earns" />
      <div className="grid gap-px border border-ink bg-ink md:grid-cols-3">
        {[
          {
            h: "It fronts a receivable, not a loan",
            p: "When a dividend goes ex, the issuer owes a known amount on a known date. The vault pays the holder now and collects from the issuer then. There is no borrower to underwrite and no collateral to price.",
          },
          {
            h: "The fee lands when the risk does",
            p: "One percent is taken at the moment the advance is booked, not when it is repaid. Share price moves immediately. LPs are paid for carrying the gap, which is exactly what they are doing.",
          },
          {
            h: "Two limits keep it boring",
            p: "Advances never exceed eighty percent of assets, and the vault refuses to book one unless it holds enough cash to pay every holder it has already promised. Boring is the product.",
          },
        ].map((block) => (
          <div key={block.h} className="bg-paper p-8">
            <h3 className="text-lg font-extrabold tracking-tighter">{block.h}</h3>
            <p className="mt-3 text-[14px] leading-relaxed text-muted">{block.p}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
