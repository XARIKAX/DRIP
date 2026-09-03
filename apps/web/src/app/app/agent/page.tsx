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
      text: "Ready. Tell me what to do with your dividends in plain words. Change a rule, collect what has built up, deposit, borrow, or ask what is going on. I will show you the exact plan before anything moves.",
    },
    { id: nextMessageId++, role: "user", text: "show my streams" },
    {
      id: nextMessageId++,
      role: "agent",
      toolLines: ["parse_intent → show", "get_streams → 2 open"],
      text: "MSFT: $180.77 paying out over the next 15 days · goes to your wallet.\nAAPL: $38.61 paying out over the next 8 days · buys more AAPL each time you collect.\nBoth add up every second. Collect whenever you like, or tell me to do it for you.",
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
                ? "From now on, every payout buys more of the same stock. Your next dividend is bigger because you own more."
                : intent.mode === "STREAM"
                  ? "From now on, dividends drip into your wallet a little every second until pay day."
                  : "From now on, you get the whole dividend the day you qualify, minus the 1% fee.",
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
          return { toolLines: tools, text: "Nothing to collect yet. The dividends are still adding up. Give them a moment." };
        }
        const total = claimable.reduce((sum, x) => sum + x.amt, 0);
        return {
          toolLines: tools,
          plan: {
            title: `Collect from ${claimable.length} stock${claimable.length > 1 ? "s" : ""}`,
            rows: claimable.map((x) => ({
              label: `${x.s.symbol} · ${MODE_LABEL[x.s.mode]}`,
              value: `$${fmt(x.amt)}${x.s.mode === "REINVEST" ? ` → buys ${x.s.symbol}` : " → your wallet"}`,
            })),
            effect: `About $${fmt(total)} moves now. Reinvest stocks buy more shares; the rest goes to your wallet.`,
            confirmLabel: `Collect $${fmt(total)}`,
            execute: async () => {
              for (const x of claimable) await actions.claimStream(x.s.id);
              return `Collected $${fmt(total)} from ${claimable.length} stock${claimable.length > 1 ? "s" : ""}.`;
            },
          },
        };
      }

      case "activate": {
        const targets = pending.filter((p) => intent.symbol === "ALL" || p.symbol === intent.symbol);
        tools.push(`get_pending → ${pending.length} waiting`);
        if (targets.length === 0) {
          return { toolLines: tools, text: "No dividends are waiting to be paid. The calendar shows what is coming." };
        }
        const total = targets.reduce((sum, p) => sum + p.grossUsd * 0.99, 0);
        return {
          toolLines: tools,
          plan: {
            title: `Get paid early on ${targets.length} dividend${targets.length > 1 ? "s" : ""}`,
            rows: targets.map((p) => ({ label: p.symbol, value: `$${fmt(p.grossUsd)} · ex date ${shortDate(p.exDate)}` })),
            effect: `About $${fmt(total)}, after the 1% fee, starts coming to you now instead of on pay day.`,
            confirmLabel: "Pay me now",
            execute: async () => {
              for (const p of targets) await actions.startPending(p.dividendId);
              return `Done. $${fmt(total)} is on its way, weeks early.`;
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
              { label: "Dividends will", value: holdings.rows.find((h) => h.symbol === intent.symbol) ? "Keep the current rule" : "Stream (the default)" },
            ],
            effect: "The deposit is on the record the moment it lands. Any dividend with an ex date after that is yours.",
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
            effect: "Dividends you already qualified for stay yours. Future ones count the smaller amount.",
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
          return { toolLines: tools, text: `You can borrow up to $${fmt(credit.availableUsd)} right now, which is ${credit.maxLtvPct.toFixed(0)}% of your stock. Deposit more stock or borrow less.` };
        }
        const newDebt = credit.borrowedUsd + usd;
        const hf = newDebt > 0 ? (credit.collateralValueUsd * (credit.liqThresholdPct / 100)) / newDebt : Infinity;
        const interest = newDebt * (credit.borrowAprPct / 100);
        return {
          toolLines: tools,
          plan: {
            title: `Borrow $${fmt(usd)} USDG`,
            rows: [
              { label: "You would owe", value: `$${fmt(newDebt)}` },
              { label: "Safety score after", value: hf.toFixed(2) },
              { label: "Interest per year", value: `$${fmt(interest)} at ${credit.borrowAprPct.toFixed(1)}%` },
              { label: "Dividends per year", value: `$${fmt(credit.dividendsPerYearUsd)}` },
            ],
            effect:
              credit.dividendsPerYearUsd >= interest
                ? "Your dividends still earn more than the interest costs. The loan pays for itself."
                : "The interest would cost more than your dividends earn. The difference gets added to the loan.",
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
        if (credit.borrowedUsd <= 0) return { toolLines: tools, text: "You have not borrowed anything. Nothing to repay." };
        const amount = Math.min(usd, credit.borrowedUsd);
        return {
          toolLines: tools,
          plan: {
            title: `Repay $${fmt(amount)} USDG`,
            rows: [{ label: "You would owe", value: `$${fmt(credit.borrowedUsd - amount)}` }],
            effect: amount >= credit.borrowedUsd ? "Pays the loan off completely. Your stock keeps earning either way." : "Your safety score goes up and the interest drops right away.",
            confirmLabel: `Repay $${fmt(amount)}`,
            execute: async () => {
              await actions.repay(amount);
              return `Repaid $${fmt(amount)}. You now owe $${fmt(credit.borrowedUsd - amount)}.`;
            },
          },
        };
      }

      case "set_slippage":
        return {
          toolLines: tools,
          plan: {
            title: `Allow up to ${(intent.bps / 100).toFixed(2)}% worse price when buying`,
            rows: [{ label: "Applies to", value: "Every time a dividend buys more stock for you" }],
            effect: "If the price would be worse than this, the purchase is cancelled instead of going through badly.",
            confirmLabel: "Set the limit",
            execute: async () => `Limit set to ${(intent.bps / 100).toFixed(2)}%.`,
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
                ? "Nothing is paying out right now."
                : open
                    .map(
                      (s) =>
                        `${s.symbol}: $${fmt(streamClaimable(s, Date.now()))} ready to collect, of $${fmt(s.totalUsd)} total · ${MODE_LABEL[s.mode]} · pays until ${shortDate(s.end)}`
                    )
                    .join("\n"),
          };
        }
        if (intent.what === "calendar") {
          const next = calendar.rows.filter((d) => d.status === "DECLARED" && d.exDate * 1000 > Date.now()).slice(0, 4);
          return {
            toolLines: tools,
            text: next.length === 0 ? "No dividends announced yet." : next.map((d) => `${d.symbol}: $${fmt(d.perShare)} a share, ex date ${shortDate(d.exDate)}, paid ${d.daysEarly} days early`).join("\n"),
          };
        }
        if (intent.what === "credit") {
          return {
            toolLines: tools,
            text: `Your stock is worth $${fmt(credit.collateralValueUsd, 0)} · you borrowed $${fmt(credit.borrowedUsd, 0)} of a possible $${fmt(credit.maxBorrowUsd, 0)} · safety score ${Number.isFinite(credit.healthFactor) ? credit.healthFactor.toFixed(2) : "∞"}.\nDividends earn $${fmt(credit.dividendsPerYearUsd)} a year, interest costs $${fmt(credit.interestPerYearUsd)} a year. You come out ${credit.netCarryPerYearUsd >= 0 ? "ahead" : "behind"} by $${fmt(Math.abs(credit.netCarryPerYearUsd))} a year.`,
          };
        }
        if (intent.what === "vault") {
          return {
            toolLines: tools,
            text: `The pool holds $${fmt(vault.vault.tvlUsd, 0)} · earns ${vault.vault.apyPct.toFixed(2)}% a year · ${vault.vault.utilizationPct.toFixed(1)}% of it is lent out, out of an ${vault.vault.capPct.toFixed(0)}% limit.`,
          };
        }
        return {
          toolLines: tools,
          text:
            holdings.rows.length === 0
              ? "You have no stock in Osinko yet."
              : holdings.rows.map((h) => `${h.symbol}: ${fmt(h.amount, 4)} shares · $${fmt(h.valueUsd)} · dividends set to ${MODE_LABEL[h.mode]}`).join("\n"),
        };
      }

      case "unsupported":
        return {
          toolLines: tools,
          plan: {
            title: "I can't do that. Here is why",
            rows: [{ label: "Reason", value: intent.reason }],
            effect: intent.suggestion,
            confirmLabel: null,
            execute: null,
          },
        };

      default:
        return {
          toolLines: tools,
          text: 'I did not catch that. I can change a rule ("reinvest all my MSFT dividends"), collect ("claim everything"), move stock ("deposit 25 AAPL"), borrow ("borrow 5000 USDG"), or report ("show my streams").',
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
          <div className="serial">Say it in plain words</div>
          <h1 className="mt-4 display text-display">Agent</h1>
        </div>
        <p className="max-w-sm text-[13px] text-panel-muted">
          An outside AI agent can use these same six commands through MCP. It can plan. Only you can sign.
        </p>
      </header>

      <section className="panel flex flex-col" aria-label="Agent console">
        <div className="panel-head">
          <span className="panel-title">osinko · agent</span>
          <span className="num text-micro font-bold uppercase text-panel-faint">{source === "demo" ? "portfolio session" : "wallet session"}</span>
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
            Nothing happens until you click confirm, and on chain until you sign. The agent cannot move your money on its own.
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
