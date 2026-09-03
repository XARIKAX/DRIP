"use client";

import { useEffect, useRef, useState } from "react";
import { fmt, shortDate } from "@/components/live";
import { EXAMPLE_PROMPTS, parseIntent, type Intent } from "@/lib/intents";
import {
  useCalendarRows,
  useCreditView,
  useDataActions,
  useDataSource,
  useHoldings,
  usePendingAdvances,
  useStreamRows,
  useTokensView,
  useVaultView,
} from "@/lib/data/provider";
import { MODE_LABEL, streamClaimable, type ModeName } from "@/lib/data/types";

/**
 * The agent console. A real terminal, not a toy: every command becomes visible tool
 * calls, then a parsed plan card stating exactly what will change. Nothing executes
 * without Confirm, and on chain nothing executes without a signature.
 */

interface Plan {
  title: string;
  rows: { label: string; value: string }[];
  effect: string;
  confirmLabel: string | null;
  execute: (() => Promise<string>) | null;
}

interface Message {
  id: number;
  role: "user" | "agent";
  text?: string;
  toolLines?: string[];
  plan?: Plan;
  planState?: "proposed" | "running" | "done" | "dismissed";
  result?: string;
}

let nextMessageId = 1;

export default function AgentPage() {
  const source = useDataSource();
  const holdings = useHoldings();
  const streams = useStreamRows();
  const calendar = useCalendarRows();
  const pending = usePendingAdvances();
  const vault = useVaultView();
  const credit = useCreditView();
  const actions = useDataActions();

  const [messages, setMessages] = useState<Message[]>(() => [
    {
      id: nextMessageId++,
      role: "agent",
      text: "Console ready. Tell me what to do with your dividends — set modes, claim streams, deposit, or ask what is running. I will show you the exact plan before anything moves.",
    },
    { id: nextMessageId++, role: "user", text: "show my streams" },
    {
      id: nextMessageId++,
      role: "agent",
      toolLines: ["parse_intent → show", "get_streams → 2 open"],
      text: "MSFT: $180.77 streaming for 15 more days · Stream mode, pays your wallet.\nAAPL: $38.61 streaming for 8 more days · Reinvest mode, every claim buys more AAPL.\nBoth accrue every second. Claim whenever you like, or tell me to claim for you.",
    },
  ]);
  const [input, setInput] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const tokens = useTokensView();
  const uniqueSymbols = [...new Set(tokens.map((t) => t.symbol).concat(holdings.rows.map((h) => h.symbol)))];

  function buildPlan(intent: Intent): { toolLines: string[]; plan?: Plan; text?: string } {
    const tools = [`parse_intent → ${intent.kind}`];

    switch (intent.kind) {
      case "set_mode": {
        const targets = intent.symbol === "ALL" ? holdings.rows.map((h) => h.symbol) : [intent.symbol];
        const existing = targets.filter((s) => holdings.rows.some((h) => h.symbol === s));
        tools.push(`get_positions → ${holdings.rows.length} positions`);
        if (existing.length === 0) {
          return { toolLines: tools, text: `No deposited position in ${targets.join(", ")}. Deposit first, then set the rule.` };
        }
        const label = MODE_LABEL[intent.mode];
        return {
          toolLines: tools,
          plan: {
            title: `Set ${existing.length === 1 ? existing[0] : `${existing.length} positions`} to ${label}`,
            rows: existing.map((s) => {
              const h = holdings.rows.find((x) => x.symbol === s)!;
              return { label: s, value: `${MODE_LABEL[h.mode]} → ${label}` };
            }),
            effect:
              intent.mode === "REINVEST"
                ? "Every future claim swaps straight back into the same stock. The next dividend is computed on a bigger balance."
                : intent.mode === "STREAM"
                  ? "Future dividends accrue per second to your wallet from ex date to pay date."
                  : "Future dividends pay in full at the ex date, minus the one percent advance fee.",
            confirmLabel: `Set ${existing.length} rule${existing.length > 1 ? "s" : ""}`,
            execute: async () => {
              for (const s of existing) await actions.setMode(s, intent.mode);
              return `${existing.join(", ")} set to ${label}.`;
            },
          },
        };
      }

      case "claim": {
        const open = streams.rows.filter(
          (s) => !s.closed && (intent.symbol === "ALL" || s.symbol === intent.symbol)
        );
        const claimable = open
          .map((s) => ({ s, amt: streamClaimable(s, Date.now()) }))
          .filter((x) => x.amt > 0.0001);
        tools.push(`get_streams → ${open.length} open`);
        if (claimable.length === 0) {
          return { toolLines: tools, text: "Nothing claimable right now. Streams are still accruing — give them a moment." };
        }
        const total = claimable.reduce((sum, x) => sum + x.amt, 0);
        return {
          toolLines: tools,
          plan: {
            title: `Claim ${claimable.length} stream${claimable.length > 1 ? "s" : ""}`,
            rows: claimable.map((x) => ({
              label: `${x.s.symbol} · ${MODE_LABEL[x.s.mode]}`,
              value: `$${fmt(x.amt)}${x.s.mode === "REINVEST" ? ` → buys ${x.s.symbol}` : " → wallet"}`,
            })),
            effect: `About $${fmt(total)} moves now. Reinvest streams compound; stream mode pays your wallet.`,
            confirmLabel: `Claim $${fmt(total)}`,
            execute: async () => {
              for (const x of claimable) await actions.claimStream(x.s.id);
              return `Claimed $${fmt(total)} across ${claimable.length} stream${claimable.length > 1 ? "s" : ""}.`;
            },
          },
        };
      }

      case "activate": {
        const targets = pending.filter((p) => intent.symbol === "ALL" || p.symbol === intent.symbol);
        tools.push(`get_pending → ${pending.length} waiting`);
        if (targets.length === 0) {
          return { toolLines: tools, text: "No dividends are waiting to start. The calendar shows what is coming." };
        }
        const total = targets.reduce((sum, p) => sum + p.grossUsd * 0.99, 0);
        return {
          toolLines: tools,
          plan: {
            title: `Start ${targets.length} advance${targets.length > 1 ? "s" : ""}`,
            rows: targets.map((p) => ({ label: p.symbol, value: `$${fmt(p.grossUsd)} gross · ex ${shortDate(p.exDate)}` })),
            effect: `About $${fmt(total)} net of the one percent fee starts moving now instead of at the pay date.`,
            confirmLabel: "Start now",
            execute: async () => {
              for (const p of targets) await actions.startPending(p.dividendId);
              return `Started. $${fmt(total)} is on its way, weeks early.`;
            },
          },
        };
      }

      case "deposit": {
        const shares = Number.parseFloat(intent.amount);
        tools.push(`get_wallet → checking ${intent.symbol}`);
        return {
          toolLines: tools,
          plan: {
            title: `Deposit ${fmt(shares, 4)} ${intent.symbol}`,
            rows: [
              { label: "Token", value: intent.symbol },
              { label: "Amount", value: `${fmt(shares, 4)} shares` },
              { label: "Mode", value: holdings.rows.find((h) => h.symbol === intent.symbol) ? "Keeps current rule" : "Stream (default)" },
            ],
            effect: "Eligibility is checkpointed the moment it lands. The next ex date after that is yours.",
            confirmLabel: "Deposit",
            execute: async () => {
              await actions.deposit(intent.symbol, shares);
              return `${fmt(shares, 4)} ${intent.symbol} deposited.`;
            },
          },
        };
      }

      case "withdraw": {
        const shares = Number.parseFloat(intent.amount);
        const h = holdings.rows.find((x) => x.symbol === intent.symbol);
        tools.push(`get_positions → ${h ? fmt(h.amount, 4) : "0"} ${intent.symbol} deposited`);
        if (!h || h.amount < shares) {
          return { toolLines: tools, text: `You have ${h ? fmt(h.amount, 4) : "0"} ${intent.symbol} on deposit. Cannot withdraw ${fmt(shares, 4)}.` };
        }
        return {
          toolLines: tools,
          plan: {
            title: `Withdraw ${fmt(shares, 4)} ${intent.symbol}`,
            rows: [{ label: intent.symbol, value: `${fmt(h.amount, 4)} → ${fmt(h.amount - shares, 4)} deposited` }],
            effect: "Dividends already declared stay yours. Future ex dates see the smaller balance.",
            confirmLabel: "Withdraw",
            execute: async () => {
              await actions.withdraw(intent.symbol, shares);
              return `${fmt(shares, 4)} ${intent.symbol} back in your wallet.`;
            },
          },
        };
      }

      case "borrow": {
        const usd = Number.parseFloat(intent.amount);
        tools.push(`get_credit → $${fmt(credit.availableUsd, 0)} available`);
        if (usd > credit.availableUsd) {
          return { toolLines: tools, text: `Only $${fmt(credit.availableUsd)} is available at ${credit.maxLtvPct.toFixed(0)}% LTV. Deposit more collateral or borrow less.` };
        }
        const newDebt = credit.borrowedUsd + usd;
        const hf = newDebt > 0 ? (credit.collateralValueUsd * (credit.liqThresholdPct / 100)) / newDebt : Infinity;
        const interest = newDebt * (credit.borrowAprPct / 100);
        return {
          toolLines: tools,
          plan: {
            title: `Borrow $${fmt(usd)} USDG`,
            rows: [
              { label: "Debt after", value: `$${fmt(newDebt)}` },
              { label: "Health factor after", value: hf.toFixed(2) },
              { label: "Interest / year", value: `$${fmt(interest)} at ${credit.borrowAprPct.toFixed(1)}%` },
              { label: "Dividends / year", value: `$${fmt(credit.dividendsPerYearUsd)}` },
            ],
            effect:
              credit.dividendsPerYearUsd >= interest
                ? "Your dividends still out-earn the interest. The loan carries itself."
                : "Interest would exceed your dividend income. The gap accrues to the debt.",
            confirmLabel: `Borrow $${fmt(usd)}`,
            execute: async () => {
              await actions.borrow(usd);
              return `$${fmt(usd)} USDG drawn. It is in your wallet.`;
            },
          },
        };
      }

      case "repay": {
        const usd = intent.amount === "ALL" ? credit.borrowedUsd : Number.parseFloat(intent.amount);
        tools.push(`get_credit → $${fmt(credit.borrowedUsd, 0)} outstanding`);
        if (credit.borrowedUsd <= 0) return { toolLines: tools, text: "Nothing is borrowed. Your credit line is clean." };
        const amount = Math.min(usd, credit.borrowedUsd);
        return {
          toolLines: tools,
          plan: {
            title: `Repay $${fmt(amount)} USDG`,
            rows: [{ label: "Debt after", value: `$${fmt(credit.borrowedUsd - amount)}` }],
            effect: amount >= credit.borrowedUsd ? "Clears the line entirely. Collateral keeps earning either way." : "Health factor improves; interest cost drops immediately.",
            confirmLabel: `Repay $${fmt(amount)}`,
            execute: async () => {
              await actions.repay(amount);
              return `Repaid $${fmt(amount)}. Debt now $${fmt(credit.borrowedUsd - amount)}.`;
            },
          },
        };
      }

      case "set_slippage":
        return {
          toolLines: tools,
          plan: {
            title: `Set reinvest slippage to ${(intent.bps / 100).toFixed(2)}%`,
            rows: [{ label: "Applies to", value: "Every reinvest swap on your account" }],
            effect: "A swap that would fill worse than this reverts instead of filling badly.",
            confirmLabel: "Set slippage",
            execute: async () => `Slippage tolerance set to ${(intent.bps / 100).toFixed(2)}%.`,
          },
        };

      case "show": {
        tools.push(`get_${intent.what} → ok`);
        if (intent.what === "streams") {
          const open = streams.rows.filter((s) => !s.closed);
          return {
            toolLines: tools,
            text:
              open.length === 0
                ? "No streams running."
                : open
                    .map(
                      (s) =>
                        `${s.symbol}: $${fmt(streamClaimable(s, Date.now()))} claimable of $${fmt(s.totalUsd)} · ${MODE_LABEL[s.mode]} · pays until ${shortDate(s.end)}`
                    )
                    .join("\n"),
          };
        }
        if (intent.what === "calendar") {
          const next = calendar.rows.filter((d) => d.status === "DECLARED" && d.exDate * 1000 > Date.now()).slice(0, 4);
          return {
            toolLines: tools,
            text: next.length === 0 ? "Nothing declared." : next.map((d) => `${d.symbol}: $${fmt(d.perShare)}/share, ex ${shortDate(d.exDate)}, paid ${d.daysEarly} days early`).join("\n"),
          };
        }
        if (intent.what === "credit") {
          return {
            toolLines: tools,
            text: `Collateral $${fmt(credit.collateralValueUsd, 0)} · borrowed $${fmt(credit.borrowedUsd, 0)} of $${fmt(credit.maxBorrowUsd, 0)} · health factor ${Number.isFinite(credit.healthFactor) ? credit.healthFactor.toFixed(2) : "∞"}.\nDividends $${fmt(credit.dividendsPerYearUsd)}/yr vs interest $${fmt(credit.interestPerYearUsd)}/yr → net carry ${credit.netCarryPerYearUsd >= 0 ? "+" : "-"}$${fmt(Math.abs(credit.netCarryPerYearUsd))}/yr.`,
          };
        }
        if (intent.what === "vault") {
          return {
            toolLines: tools,
            text: `Vault: $${fmt(vault.vault.tvlUsd, 0)} TVL · ${vault.vault.apyPct.toFixed(2)}% APY · ${vault.vault.utilizationPct.toFixed(1)}% utilised of an ${vault.vault.capPct.toFixed(0)}% cap.`,
          };
        }
        return {
          toolLines: tools,
          text:
            holdings.rows.length === 0
              ? "Nothing on deposit."
              : holdings.rows.map((h) => `${h.symbol}: ${fmt(h.amount, 4)} shares · $${fmt(h.valueUsd)} · ${MODE_LABEL[h.mode]}`).join("\n"),
        };
      }

      case "unsupported":
        return {
          toolLines: tools,
          plan: {
            title: "Cannot do that, and here is why",
            rows: [{ label: "Reason", value: intent.reason }],
            effect: intent.suggestion,
            confirmLabel: null,
            execute: null,
          },
        };

      default:
        return {
          toolLines: tools,
          text: 'Not recognised. I can set modes ("reinvest all my MSFT dividends"), claim ("claim everything"), move stock ("deposit 25 AAPL"), or report ("show my streams").',
        };
    }
  }

  function send(raw: string) {
    const text = raw.trim();
    if (!text) return;
    setInput("");
    const intent = parseIntent(text, uniqueSymbols);
    const { toolLines, plan, text: reply } = buildPlan(intent);

    setMessages((m) => [
      ...m,
      { id: nextMessageId++, role: "user", text },
      { id: nextMessageId++, role: "agent", toolLines, plan, planState: plan ? "proposed" : undefined, text: reply },
    ]);
  }

  async function confirm(id: number) {
    const msg = messages.find((m) => m.id === id);
    if (!msg?.plan?.execute) return;
    setMessages((m) => m.map((x) => (x.id === id ? { ...x, planState: "running" } : x)));
    const result = await msg.plan.execute();
    setMessages((m) => m.map((x) => (x.id === id ? { ...x, planState: "done", result } : x)));
  }

  function dismiss(id: number) {
    setMessages((m) => m.map((x) => (x.id === id ? { ...x, planState: "dismissed" } : x)));
  }

  return (
    <div className="rise-group space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-8">
        <div className="min-w-0">
          <div className="serial">Module 05</div>
          <h1 className="mt-4 display text-display">Agent console</h1>
        </div>
        <p className="max-w-sm text-[13px] text-panel-muted">
          The same six tools are exposed over MCP, so an external agent drives exactly what this console drives.
        </p>
      </header>

      <section className="panel flex flex-col" aria-label="Agent console">
        <div className="panel-head">
          <span className="panel-title">osinko · agent</span>
          <span className="num text-micro font-bold uppercase text-panel-faint">{source === "demo" ? "demo session" : "chain session"}</span>
        </div>

        <div ref={logRef} className="dark-scroll min-h-[280px] flex-1 space-y-5 overflow-y-auto px-5 py-5" style={{ maxHeight: 560 }}>
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[85%] border border-panel-line bg-panel-2 px-4 py-2.5">
                  <span className="num text-[13px] text-panel-text">{m.text}</span>
                </div>
              </div>
            ) : (
              <div key={m.id} className="max-w-[92%] space-y-2.5">
                {m.toolLines?.map((line, i) => (
                  <div key={i} className="num text-[12px] text-panel-faint">
                    <span className="text-cyan">▸</span> {line}
                  </div>
                ))}
                {m.text ? <TypeText text={m.text} /> : null}
                {m.plan ? (
                  <PlanCard
                    plan={m.plan}
                    state={m.planState ?? "proposed"}
                    result={m.result}
                    onConfirm={() => void confirm(m.id)}
                    onDismiss={() => dismiss(m.id)}
                  />
                ) : null}
              </div>
            )
          )}
        </div>

        <div className="border-t border-panel-line p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {EXAMPLE_PROMPTS.slice(0, 6).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => send(p)}
                className="border border-panel-line px-2.5 py-1 text-[12px] text-panel-muted transition-colors hover:border-cyan hover:text-cyan"
              >
                {p}
              </button>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <span className="num self-center text-[15px] text-cyan" aria-hidden>
              ❯
            </span>
            <input
              className="num w-full border border-panel-line bg-panel-2 px-3 py-2.5 text-[14px] text-panel-text outline-none placeholder:text-panel-faint focus:border-cyan"
              placeholder="reinvest all my MSFT dividends"
              aria-label="Agent command"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button type="submit" className="btn-accent btn-sm">
              Run
            </button>
          </form>
          <p className="mt-3 text-[11px] text-panel-faint">
            Agent actions always require your confirmation, and on chain your signature. Nothing auto executes.
          </p>
        </div>
      </section>
    </div>
  );
}

/** Streaming text effect for agent replies. */
function TypeText({ text }: { text: string }) {
  const [shown, setShown] = useState(0);
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (reduced) {
      setShown(text.length);
      return;
    }
    setShown(0);
    let i = 0;
    const id = setInterval(() => {
      i += 3;
      setShown(i);
      if (i >= text.length) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [text, reduced]);

  return <p className="whitespace-pre-line text-[14px] leading-relaxed text-panel-text">{text.slice(0, shown)}</p>;
}

function PlanCard({
  plan,
  state,
  result,
  onConfirm,
  onDismiss,
}: {
  plan: Plan;
  state: "proposed" | "running" | "done" | "dismissed";
  result?: string;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="border border-panel-line bg-panel-2">
      <div className="flex items-center justify-between border-b border-panel-line px-4 py-2.5">
        <span className="text-[13px] font-extrabold tracking-tight text-panel-text">{plan.title}</span>
        <span className="text-micro font-bold uppercase text-panel-faint">
          {state === "done" ? "Executed" : state === "dismissed" ? "Dismissed" : "Plan"}
        </span>
      </div>
      <dl className="px-4 py-2">
        {plan.rows.map((r, i) => (
          <div key={i} className="flex items-baseline justify-between gap-4 border-b border-panel-line py-2 last:border-b-0">
            <dt className="text-micro font-bold uppercase text-panel-muted">{r.label}</dt>
            <dd className="num text-right text-[13px] text-panel-text">{r.value}</dd>
          </div>
        ))}
      </dl>
      <p className="px-4 pb-3 text-[12px] leading-snug text-panel-muted">{plan.effect}</p>
      {state === "done" && result ? (
        <p className="border-t border-panel-line px-4 py-3 text-[13px] text-cyan">{result}</p>
      ) : null}
      {state === "proposed" && plan.confirmLabel ? (
        <div className="flex gap-2 border-t border-panel-line p-3">
          <button type="button" className="btn-accent btn-sm" onClick={onConfirm}>
            {plan.confirmLabel}
          </button>
          <button type="button" className="border border-panel-line px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-panel-muted hover:text-panel-text" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      ) : null}
      {state === "running" ? <div className="skeleton-dark m-3 h-8" /> : null}
    </div>
  );
}
