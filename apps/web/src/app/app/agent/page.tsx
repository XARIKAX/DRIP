"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import {
  MODE_LABELS,
  buildActivate,
  buildApprove,
  buildClaimStream,
  buildDeposit,
  buildSetMaxSlippage,
  buildSetMode,
  buildWithdraw,
  formatBps,
  formatStock,
  formatUsdg,
  parseStock,
  type UnsignedTx,
} from "@drip-markets/sdk";
import { Card, Empty, Eyebrow, SectionHead } from "@/components/ui";
import { ConnectGate } from "@/components/ConnectGate";
import { TxBar } from "@/components/TxBar";
import {
  useActivatable,
  useCalendar,
  useDeployment,
  usePositions,
  useStockTokens,
  useStreams,
  useVaultStats,
} from "@/lib/hooks";
import { useTxRunner } from "@/lib/tx";
import { EXAMPLE_PROMPTS, parseIntent, type Intent } from "@/lib/intents";

/** What the console produces: something to read, or something to sign. Never both silently. */
interface Plan {
  title: string;
  steps: string[];
  txs: UnsignedTx[];
  note?: string;
  blocked?: { reason: string; suggestion: string };
}

export default function AgentPage() {
  return (
    <div className="space-y-12">
      <header className="max-w-2xl">
        <Eyebrow className="text-cyan-dark">Module 04</Eyebrow>
        <h1 className="mt-3 text-display font-extrabold">Agent console</h1>
        <p className="mt-5 text-[16px] leading-relaxed text-ink/80">
          Say what you want. The console turns it into a plan you can read and transactions you
          sign. Nothing executes on its own, here or over MCP.
        </p>
      </header>
      <ConnectGate>
        <Console />
      </ConnectGate>
      <McpNote />
    </div>
  );
}

function Console() {
  const { address } = useAccount();
  const deployment = useDeployment();
  const tokens = useStockTokens();
  const positions = usePositions();
  const streams = useStreams();
  const activatable = useActivatable();
  const calendar = useCalendar();
  const vault = useVaultStats();
  const { state, run, reset } = useTxRunner();

  const [input, setInput] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [answer, setAnswer] = useState<string[] | null>(null);

  const symbols = useMemo(() => (tokens.data ?? []).map((t) => t.symbol), [tokens.data]);

  function submit(text: string) {
    setAnswer(null);
    setPlan(null);
    if (!deployment || !address) return;

    const intent = parseIntent(text, symbols);
    const result = buildPlan(intent);
    if (Array.isArray(result)) setAnswer(result);
    else setPlan(result);
  }

  /** Turn one parsed intent into either an answer to read or a plan to sign. */
  function buildPlan(intent: Intent): Plan | string[] {
    if (!deployment || !address) return ["Connect a wallet first."];

    const tokenBySymbol = (symbol: string) => (tokens.data ?? []).find((t) => t.symbol === symbol);

    switch (intent.kind) {
      case "unsupported":
        return {
          title: "Cannot do that",
          steps: [],
          txs: [],
          blocked: { reason: intent.reason, suggestion: intent.suggestion },
        };

      case "unknown":
        return [
          "Not recognised.",
          "This console understands a fixed set of phrasings and will not guess at the rest.",
          "Try one of the examples below.",
        ];

      case "show": {
        if (intent.what === "streams") {
          const open = (streams.data ?? []).filter((s) => !s.closed);
          if (open.length === 0) return ["No open streams."];
          return open.map(
            (s) =>
              `${s.symbol} dividend #${s.dividendId}: $${formatUsdg(s.claimable)} claimable of $${formatUsdg(s.total)} total, ${MODE_LABELS[s.mode]}.`
          );
        }
        if (intent.what === "calendar") {
          const rows = (calendar.data ?? []).slice(-6);
          if (rows.length === 0) return ["Nothing declared yet."];
          return rows.map(
            (d) => `${d.symbol}: $${formatUsdg(d.amountPerToken)} per share, ${d.daysEarly} days early.`
          );
        }
        if (intent.what === "vault") {
          const v = vault.data;
          if (!v) return ["Vault not readable right now."];
          return [
            `Total assets $${formatUsdg(v.totalAssets)}.`,
            `Utilisation ${formatBps(v.utilizationBps)} percent against a ${formatBps(v.maxUtilizationBps, 0)} percent cap.`,
            `Lifetime fees $${formatUsdg(v.totalFeesAccrued)}.`,
          ];
        }
        const rows = positions.data ?? [];
        if (rows.length === 0) return ["Nothing on deposit."];
        return rows.map(
          (p) => `${p.symbol}: ${formatStock(p.amount)} on deposit, worth $${formatUsdg(p.valueUsdg)}, set to ${MODE_LABELS[p.mode]}.`
        );
      }

      case "set_mode": {
        const targets =
          intent.symbol === "ALL"
            ? (positions.data ?? [])
            : (positions.data ?? []).filter((p) => p.symbol === intent.symbol);

        if (targets.length === 0) {
          return {
            title: "Nothing to change",
            steps: [],
            txs: [],
            blocked: {
              reason:
                intent.symbol === "ALL"
                  ? "You have no positions on deposit."
                  : `You have no ${intent.symbol} on deposit.`,
              suggestion: "Deposit the token first, then set its mode.",
            },
          };
        }

        const changing = targets.filter((p) => p.mode !== intent.mode);
        if (changing.length === 0) {
          return [`Already set to ${MODE_LABELS[intent.mode]}. Nothing to sign.`];
        }

        return {
          title: `Set ${changing.map((p) => p.symbol).join(", ")} to ${MODE_LABELS[intent.mode]}`,
          steps: changing.map(
            (p) => `${p.symbol}: ${MODE_LABELS[p.mode]} becomes ${MODE_LABELS[intent.mode]}`
          ),
          txs: changing.map((p) => buildSetMode(deployment, p.stockToken, intent.mode, p.symbol)),
          note: "Mode applies to dividends declared from here on. Entitlements already routed keep the mode they were routed with.",
        };
      }

      case "claim": {
        const open = (streams.data ?? []).filter(
          (s) => !s.closed && s.claimable > 0n && (intent.symbol === "ALL" || s.symbol === intent.symbol)
        );
        if (open.length === 0) {
          return {
            title: "Nothing to claim",
            steps: [],
            txs: [],
            blocked: {
              reason: "No stream has anything accrued right now.",
              suggestion: "Streams accrue per second. Come back in a moment, or start a dividend first.",
            },
          };
        }
        const total = open.reduce((sum, s) => sum + s.claimable, 0n);
        return {
          title: `Claim $${formatUsdg(total)} across ${open.length} stream${open.length > 1 ? "s" : ""}`,
          steps: open.map((s) => `${s.symbol} #${s.dividendId}: $${formatUsdg(s.claimable)}`),
          txs: open.map((s) => buildClaimStream(deployment, s.id)),
          note: "Reinvest streams swap straight into stock. The USDG never reaches your wallet.",
        };
      }

      case "activate": {
        const rows = (activatable.data ?? []).filter(
          (r) => intent.symbol === "ALL" || r.dividend.symbol === intent.symbol
        );
        if (rows.length === 0) {
          return {
            title: "Nothing to start",
            steps: [],
            txs: [],
            blocked: {
              reason: "No declared dividend is inside its ex to pay window for your positions.",
              suggestion: "Check the calendar for the next ex date.",
            },
          };
        }
        return {
          title: `Start ${rows.length} dividend${rows.length > 1 ? "s" : ""}`,
          steps: rows.map((r) => `${r.dividend.symbol} #${r.dividend.id}: $${formatUsdg(r.gross)} gross`),
          txs: rows.map((r) => buildActivate(deployment, r.dividend.id, address)),
          note: "The vault fronts the gross and keeps one percent. Your mode decides where the rest goes.",
        };
      }

      case "deposit": {
        const token = tokenBySymbol(intent.symbol);
        if (!token) return [`${intent.symbol} is not a supported token here.`];
        const amount = parseStock(intent.amount);
        return {
          title: `Deposit ${intent.amount} ${intent.symbol}`,
          steps: [`Approve ${intent.amount} ${intent.symbol}`, `Deposit into DripCore`],
          txs: [
            buildApprove(token.address, deployment.dripCore, amount, token.symbol),
            buildDeposit(deployment, token.address, amount, token.symbol),
          ],
        };
      }

      case "withdraw": {
        const token = tokenBySymbol(intent.symbol);
        if (!token) return [`${intent.symbol} is not a supported token here.`];
        const amount = parseStock(intent.amount);
        return {
          title: `Withdraw ${intent.amount} ${intent.symbol}`,
          steps: [`Withdraw from DripCore to your wallet`],
          txs: [buildWithdraw(deployment, token.address, amount, token.symbol)],
          note: "Withdrawing does not cancel entitlements already created. It only shrinks what future ex dates see.",
        };
      }

      case "set_slippage": {
        if (intent.bps < 1 || intent.bps > 1000) {
          return {
            title: "Out of range",
            steps: [],
            txs: [],
            blocked: {
              reason: "Slippage tolerance is capped at 10 percent.",
              suggestion: "Pick something between 0.01 and 10 percent.",
            },
          };
        }
        return {
          title: `Set reinvest slippage to ${(intent.bps / 100).toFixed(2)} percent`,
          steps: [`Any reinvest fill worse than this reverts instead of filling`],
          txs: [buildSetMaxSlippage(deployment, intent.bps)],
        };
      }
    }
  }

  return (
    <div className="space-y-8">
      <TxBar state={state} onDismiss={reset} />

      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className="flex flex-col gap-3 sm:flex-row"
        >
          <input
            className="field"
            placeholder="reinvest all my KO dividends"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button type="submit" className="btn-primary shrink-0">
            Build plan
          </button>
        </form>

        <div className="mt-5 flex flex-wrap gap-2">
          {EXAMPLE_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              className="border border-faint px-3 py-2 text-[12px] text-muted transition-colors hover:border-ink hover:text-ink"
              onClick={() => {
                setInput(p);
                submit(p);
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </Card>

      {answer ? (
        <Card>
          <Eyebrow className="text-muted">Answer</Eyebrow>
          <ul className="mt-4 space-y-2">
            {answer.map((line, i) => (
              <li key={i} className="text-[15px]">
                {line}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {plan ? (
        <Card className={plan.blocked ? "border-down" : "border-cyan-dark"}>
          <div className="flex items-baseline justify-between">
            <Eyebrow className={plan.blocked ? "text-down" : "text-cyan-dark"}>
              {plan.blocked ? "Blocked" : "Confirm the plan"}
            </Eyebrow>
            {plan.txs.length > 0 ? (
              <span className="num text-micro font-bold uppercase text-muted">
                {plan.txs.length} transaction{plan.txs.length > 1 ? "s" : ""}
              </span>
            ) : null}
          </div>

          <h3 className="mt-3 text-2xl font-extrabold tracking-tighter">{plan.title}</h3>

          {plan.blocked ? (
            <div className="mt-5 space-y-3 text-[15px]">
              <p>{plan.blocked.reason}</p>
              <p className="text-muted">{plan.blocked.suggestion}</p>
            </div>
          ) : (
            <>
              <ol className="mt-5 space-y-3">
                {plan.steps.map((step, i) => (
                  <li key={i} className="flex gap-4 border-b border-faint pb-3 last:border-b-0">
                    <span className="num text-micro font-bold text-cyan-dark">0{i + 1}</span>
                    <span className="text-[14px]">{step}</span>
                  </li>
                ))}
              </ol>

              {plan.note ? <p className="mt-5 text-[13px] text-muted">{plan.note}</p> : null}

              <div className="mt-7 flex flex-wrap gap-3">
                <button type="button" className="btn-primary" onClick={() => void run(plan.txs)}>
                  Sign {plan.txs.length} transaction{plan.txs.length > 1 ? "s" : ""}
                </button>
                <button type="button" className="btn-ghost" onClick={() => setPlan(null)}>
                  Discard
                </button>
              </div>
            </>
          )}
        </Card>
      ) : null}

      {!plan && !answer ? (
        <Empty
          title="Nothing built yet"
          body="Type an instruction or pick an example. You will always see the plan before anything is signed."
        />
      ) : null}
    </div>
  );
}

function McpNote() {
  return (
    <section className="space-y-6">
      <SectionHead eyebrow="Architecture" title="Same intents, over MCP" />
      <div className="grid gap-px border border-ink bg-ink md:grid-cols-2">
        <div className="bg-paper p-8">
          <p className="text-[15px] leading-relaxed">
            This console is one client. The same six actions are exposed by{" "}
            <span className="num">packages/mcp</span> so an external agent can drive the protocol
            without a browser.
          </p>
          <ul className="mt-6 space-y-2 text-[14px] text-muted">
            {[
              "get_positions, get_streams, get_calendar answer without a signature",
              "set_mode, claim_stream, deposit return unsigned transactions",
              "No tool in the server ever holds a key",
              "The wallet is the only thing that can execute",
            ].map((line) => (
              <li key={line} className="flex gap-3">
                <span className="text-cyan-dark">—</span>
                {line}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-paper p-8">
          <Eyebrow className="text-muted">Run it</Eyebrow>
          <pre className="num mt-4 overflow-x-auto border border-faint bg-wash p-4 text-[12px] leading-relaxed">
{`pnpm --filter @drip-markets/mcp start`}
          </pre>
          <p className="mt-4 text-[13px] text-muted">
            Point any MCP client at that command. Read tools work immediately. Write tools hand back
            calldata for the user to sign.
          </p>
          <Link href="/app" className="btn-ghost btn-sm mt-6">
            Back to dashboard
          </Link>
        </div>
      </div>
    </section>
  );
}
