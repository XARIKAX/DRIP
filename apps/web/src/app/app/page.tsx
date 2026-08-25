"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import {
  DividendStatus,
  MODE_LABELS,
  Mode,
  buildActivate,
  buildClaimSettled,
  buildClaimStream,
  buildStockFaucet,
  buildUsdgFaucet,
  formatDate,
  formatStock,
  formatUsdg,
} from "@drip/sdk";
import { Card, Empty, ErrorNote, Eyebrow, Loading, SectionHead, Stat } from "@/components/ui";
import { ConnectGate } from "@/components/ConnectGate";
import { ModeSwitcher } from "@/components/ModeSwitcher";
import { StreamCounter } from "@/components/StreamCounter";
import { TxBar } from "@/components/TxBar";
import {
  useActivatable,
  useActivity,
  useClaimableSettled,
  useDeployment,
  usePositions,
  useStockTokens,
  useStreams,
  useWalletBalances,
} from "@/lib/hooks";
import { useTxRunner } from "@/lib/tx";

export default function DashboardPage() {
  return (
    <div className="space-y-14">
      <header>
        <Eyebrow className="text-cyan-dark">Dashboard</Eyebrow>
        <h1 className="mt-3 text-display font-extrabold">Your dividends, live</h1>
      </header>
      <ConnectGate>
        <DashboardBody />
      </ConnectGate>
    </div>
  );
}

function DashboardBody() {
  const { state, run, reset } = useTxRunner();

  return (
    <div className="space-y-14">
      <TxBar state={state} onDismiss={reset} />
      <Summary />
      <Streams run={run} />
      <Pending run={run} />
      <Portfolio />
      <div className="grid gap-8 lg:grid-cols-2">
        <Activity />
        <Faucet run={run} />
      </div>
    </div>
  );
}

type RunFn = ReturnType<typeof useTxRunner>["run"];

/* ------------------------------------------------------------------ */

function Summary() {
  const positions = usePositions();
  const streams = useStreams();

  const portfolioValue = (positions.data ?? []).reduce((sum, p) => sum + p.valueUsdg, 0n);
  const open = (streams.data ?? []).filter((s) => !s.closed);
  const streamingNow = open.reduce((sum, s) => sum + (s.total - s.claimed), 0n);
  const claimableNow = open.reduce((sum, s) => sum + s.claimable, 0n);

  return (
    <div className="grid gap-px border border-ink bg-ink sm:grid-cols-2 lg:grid-cols-4">
      {[
        { label: "Portfolio value", value: `$${formatUsdg(portfolioValue)}` },
        { label: "Positions", value: String(positions.data?.length ?? 0) },
        { label: "Still to stream", value: `$${formatUsdg(streamingNow)}` },
        { label: "Claimable now", value: `$${formatUsdg(claimableNow)}`, accent: true },
      ].map((s) => (
        <div key={s.label} className="bg-paper p-6">
          <Stat label={s.label} value={s.value} accent={s.accent} />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Streams({ run }: { run: RunFn }) {
  const deployment = useDeployment();
  const { data, isLoading, error, refetch } = useStreams();
  const open = (data ?? []).filter((s) => !s.closed);

  return (
    <section className="space-y-6">
      <SectionHead
        eyebrow="Module 02 and 03"
        title="Your streams"
        action={
          <p className="max-w-sm text-[13px] text-muted">
            Accruing per second from the ex date to the pay date. Claim any time.
          </p>
        }
      />

      {isLoading ? <Loading label="Reading streams" /> : null}
      {error ? <ErrorNote message={(error as Error).message} retry={() => void refetch()} /> : null}

      {!isLoading && !error && open.length === 0 ? (
        <Empty
          title="No streams yet"
          body="Deposit a stock token, pick Stream or Reinvest, then start a dividend once its shares go ex."
          action={
            <Link href="/app/deposit" className="btn-primary btn-sm">
              Deposit stock
            </Link>
          }
        />
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        {open.map((s) => {
          const pct = s.total === 0n ? 0 : Number((s.claimed * 10000n) / s.total) / 100;
          return (
            <Card key={s.id.toString()}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-2xl font-extrabold tracking-tighter">{s.symbol}</div>
                  <div className="mt-1 text-micro font-bold uppercase text-muted">
                    Dividend #{s.dividendId.toString()} · {MODE_LABELS[s.mode]}
                  </div>
                </div>
                <span className={s.mode === Mode.REINVEST ? "tag-accent" : "tag"}>
                  {s.mode === Mode.REINVEST ? "Compounding" : "Streaming"}
                </span>
              </div>

              <div className="mt-7">
                <div className="eyebrow text-muted">Claimable</div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="num text-xl text-muted">$</span>
                  <span className="text-[clamp(1.9rem,4vw,2.75rem)] font-extrabold tracking-tightest text-cyan-dark">
                    <StreamCounter
                      claimable={s.claimable}
                      ratePerSecondScaled={s.ratePerSecondScaled}
                      end={s.end}
                      closed={s.closed}
                    />
                  </span>
                </div>
              </div>

              <div className="mt-6 h-1 w-full bg-faint">
                <div className="h-1 bg-cyan" style={{ width: `${Math.min(pct, 100)}%` }} />
              </div>

              <dl className="mt-5 grid grid-cols-3 gap-4 text-[13px]">
                <div>
                  <dt className="text-micro font-bold uppercase text-muted">Total</dt>
                  <dd className="num mt-1 font-semibold">${formatUsdg(s.total)}</dd>
                </div>
                <div>
                  <dt className="text-micro font-bold uppercase text-muted">Claimed</dt>
                  <dd className="num mt-1 font-semibold">${formatUsdg(s.claimed)}</dd>
                </div>
                <div>
                  <dt className="text-micro font-bold uppercase text-muted">Pay date</dt>
                  <dd className="num mt-1 font-semibold">{formatDate(s.end)}</dd>
                </div>
              </dl>

              <button
                type="button"
                className="btn-primary mt-7 w-full"
                disabled={!deployment || s.claimable === 0n}
                onClick={() => deployment && void run([buildClaimStream(deployment, s.id)])}
              >
                {s.mode === Mode.REINVEST ? "Claim and reinvest" : "Claim"}
              </button>
              {s.mode === Mode.REINVEST ? (
                <p className="mt-3 text-[12px] text-muted">
                  The USDG never reaches your wallet. It buys {s.symbol} and lands back in your position.
                </p>
              ) : null}
            </Card>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Pending({ run }: { run: RunFn }) {
  const { address } = useAccount();
  const deployment = useDeployment();
  const activatable = useActivatable();
  const settled = useClaimableSettled();

  const rows = activatable.data ?? [];
  const settledRows = settled.data ?? [];
  if (rows.length === 0 && settledRows.length === 0) return null;

  return (
    <section className="space-y-6">
      <SectionHead eyebrow="Waiting for you" title="Dividends ready to start" />

      <div className="overflow-x-auto border border-ink">
        <table className="data-table text-[14px]">
          <thead>
            <tr>
              <th>Token</th>
              <th>Dividend</th>
              <th>Gross</th>
              <th>Window</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ dividend, gross }) => (
              <tr key={`a-${dividend.id}`}>
                <td className="font-extrabold">{dividend.symbol}</td>
                <td className="num">#{dividend.id.toString()}</td>
                <td className="num font-semibold">${formatUsdg(gross)}</td>
                <td className="num text-muted">
                  {formatDate(dividend.exDate)} to {formatDate(dividend.payDate)}
                </td>
                <td className="text-right">
                  <button
                    type="button"
                    className="btn-accent btn-sm"
                    disabled={!deployment || !address}
                    onClick={() =>
                      deployment && address && void run([buildActivate(deployment, dividend.id, address)])
                    }
                  >
                    Start
                  </button>
                </td>
              </tr>
            ))}
            {settledRows.map(({ dividend, gross }) => (
              <tr key={`s-${dividend.id}`}>
                <td className="font-extrabold">{dividend.symbol}</td>
                <td className="num">#{dividend.id.toString()}</td>
                <td className="num font-semibold">${formatUsdg(gross)}</td>
                <td className="text-muted">Settled, no fee</td>
                <td className="text-right">
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    disabled={!deployment}
                    onClick={() => deployment && void run([buildClaimSettled(deployment, dividend.id)])}
                  >
                    Claim
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Portfolio() {
  const { data, isLoading, error, refetch } = usePositions();

  return (
    <section className="space-y-6">
      <SectionHead
        eyebrow="Custody"
        title="Portfolio"
        action={
          <Link href="/app/deposit" className="btn-ghost btn-sm">
            Deposit or withdraw
          </Link>
        }
      />

      {isLoading ? <Loading label="Reading positions" /> : null}
      {error ? <ErrorNote message={(error as Error).message} retry={() => void refetch()} /> : null}

      {!isLoading && !error && (data ?? []).length === 0 ? (
        <Empty
          title="Nothing on deposit"
          body="Only stock tokens held here before an ex date are eligible. That is the trade: opt in by depositing, and every dividend after that works the new way."
          action={
            <Link href="/app/deposit" className="btn-primary btn-sm">
              Deposit stock
            </Link>
          }
        />
      ) : null}

      {(data ?? []).length > 0 ? (
        <div className="overflow-x-auto border border-ink">
          <table className="data-table text-[14px]">
            <thead>
              <tr>
                <th>Token</th>
                <th>On deposit</th>
                <th>Value</th>
                <th>Mode</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((p) => (
                <tr key={p.stockToken}>
                  <td className="font-extrabold">{p.symbol}</td>
                  <td className="num">{formatStock(p.amount)}</td>
                  <td className="num font-semibold">${formatUsdg(p.valueUsdg)}</td>
                  <td>
                    <ModeSwitcher
                      stockToken={p.stockToken}
                      symbol={p.symbol}
                      current={p.mode}
                      onChanged={() => void refetch()}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Activity() {
  const { data, isLoading, error } = useActivity();

  return (
    <section className="space-y-6">
      <SectionHead eyebrow="From events" title="Activity" />
      {isLoading ? <Loading label="Reading logs" /> : null}
      {error ? <ErrorNote message={(error as Error).message} /> : null}
      {!isLoading && (data ?? []).length === 0 ? (
        <Empty title="Nothing yet" body="Deposits, claims and reinvestments show up here as they land." />
      ) : null}
      {(data ?? []).length > 0 ? (
        <ul className="border border-ink">
          {(data ?? []).slice(0, 12).map((item, i) => (
            <li
              key={`${item.txHash}-${i}`}
              className="flex items-baseline justify-between gap-4 border-b border-faint px-5 py-4 last:border-b-0"
            >
              <span className="text-[14px]">{item.summary}</span>
              <span className="num shrink-0 text-micro font-bold uppercase text-muted">
                #{item.blockNumber.toString()}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Faucet({ run }: { run: RunFn }) {
  const deployment = useDeployment();
  const tokens = useStockTokens();
  const balances = useWalletBalances();

  return (
    <section className="space-y-6">
      <SectionHead eyebrow="Testnet" title="Faucet" />
      <Card>
        <p className="text-[14px] text-muted">
          Two clicks and you have something to deposit. Rate limited to once an hour per wallet.
          None of it is worth anything.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            className="btn-accent btn-sm"
            disabled={!deployment}
            onClick={() => deployment && void run([buildUsdgFaucet(deployment)])}
          >
            Mint USDG
          </button>
          {(tokens.data ?? []).map((t) => (
            <button
              key={t.address}
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => void run([buildStockFaucet(t.address, t.symbol)])}
            >
              Mint {t.symbol}
            </button>
          ))}
        </div>

        <div className="rule-t mt-7 pt-5">
          <div className="eyebrow text-muted">In your wallet</div>
          <dl className="mt-4 grid grid-cols-2 gap-4 text-[13px] sm:grid-cols-3">
            <div>
              <dt className="text-micro font-bold uppercase text-muted">USDG</dt>
              <dd className="num mt-1 font-semibold">{formatUsdg(balances.data?.usdg ?? 0n)}</dd>
            </div>
            {(tokens.data ?? []).map((t) => (
              <div key={t.address}>
                <dt className="text-micro font-bold uppercase text-muted">{t.symbol}</dt>
                <dd className="num mt-1 font-semibold">
                  {formatStock(balances.data?.stocks[t.address] ?? 0n, 2)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </Card>
    </section>
  );
}
