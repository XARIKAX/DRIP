"use client";

import { useState } from "react";
import { Steps } from "@/components/app/Steps";
import { fmt } from "@/components/live";
import { TokenMark } from "@/components/TokenMark";
import { useDataActions, useStackPosition, useStackRows } from "@/lib/data/provider";
import type { StackLeg, StackRow } from "@/lib/data/types";
import { explorerAddress, isDeployed } from "@/lib/chain.config";

/**
 * Stacks: one token that holds several.
 *
 * The page has to carry one idea and one caveat.
 *
 * The idea is that a Stack is a receipt, not a fund. There is no manager, no NAV, no
 * swap: minting hands the vault a fixed number of each constituent and gets a share
 * back, redeeming reverses it exactly, and the recipe never changes. Everything on
 * this page is therefore stated as a *quantity* — "0.01 NVDA, 10,000 PONS" — with the
 * dollar figure as a secondary column. That ordering is the explanation.
 *
 * The caveat is that most of what a Stack holds has no price. A Chainlink feed exists
 * for the equities and will never exist for a memecoin, so a basket that mixes them
 * has a value that is knowably incomplete. The page says so on every figure that is
 * affected rather than printing a total that looks whole, because a number that reads
 * like a valuation and is in fact a floor is worse than no number at all.
 */
export default function StacksPage() {
  const { rows, loading } = useStackRows();
  const [selected, setSelected] = useState<number | null>(null);
  const active = rows.find((s) => s.stackId === selected) ?? rows[0] ?? null;

  return (
    <div className="rise-group space-y-10" data-shot="stacks">
      <header className="max-w-3xl border-b border-line pb-8">
        <div className="serial">One token, a whole basket</div>
        <h1 className="mt-4 display text-display">Stacks</h1>
        <p className="mt-5 text-[16px] leading-relaxed text-muted">
          A Stack is a fixed recipe of tokens, wrapped into one. Hand over every
          ingredient and you get a single share back; hand the share back and you get
          every ingredient out, in exactly the amounts the recipe names. No manager, no
          fee, no swap — the vault is only ever holding what you put in it.
        </p>
      </header>

      {active ? (
        <>
          {rows.length > 1 ? (
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Pick a Stack">
              {rows.map((s) => {
                const on = s.stackId === active.stackId;
                return (
                  <button
                    key={s.stackId}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setSelected(s.stackId)}
                    className={`rounded-full px-3.5 py-2 text-[13px] font-semibold transition ${
                      on ? "bg-accent text-ground" : "border border-line text-muted hover:text-ink"
                    }`}
                  >
                    {s.symbol}
                  </button>
                );
              })}
            </div>
          ) : null}

          <StackDetail key={active.stackId} stack={active} />
        </>
      ) : (
        <section className="panel p-8 text-[14px] leading-relaxed text-muted">
          {loading
            ? "Reading the chain…"
            : isDeployed
              ? "No Stacks have been created on this network yet."
              : "This network has no Osinko deployment. Switch to Robinhood Chain."}
        </section>
      )}

      <HowItWorks />
    </div>
  );
}

function StackDetail({ stack }: { stack: StackRow }) {
  return (
    <>
      <Headline stack={stack} />
      <Recipe stack={stack} />
      <div className="grid gap-8 lg:grid-cols-2">
        <MintPanel stack={stack} />
        <YourShares stack={stack} />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

/**
 * What one share is, in three figures.
 *
 * The dollar figure leads with "at least" whenever a leg went unpriced, which on this
 * chain's first basket is always. That phrasing is load-bearing — it is the difference
 * between a floor and a claim.
 */
function Headline({ stack }: { stack: StackRow }) {
  const partial = stack.unpriced.length > 0;

  return (
    <section className="panel" aria-label={`${stack.symbol} at a glance`}>
      <div className="grid gap-px bg-line md:grid-cols-3">
        <div className="bg-ground p-6">
          <div className="panel-title">One {stack.symbol} share holds</div>
          <div className="mt-3 text-[clamp(24px,2.6vw,34px)] font-semibold tracking-tighter text-ink">
            {stack.legs.length} token{stack.legs.length === 1 ? "" : "s"}
          </div>
          <div className="mt-1 text-[12px] text-muted">
            {stack.legs.map((l) => l.symbol).join(" · ")}
          </div>
        </div>
        <div className="bg-ground p-6">
          <div className="panel-title">{partial ? "Priced part of a share" : "One share is worth"}</div>
          <div className="mt-3 text-[clamp(24px,2.6vw,34px)] font-semibold tracking-tighter text-ink">
            {partial ? "≥ " : ""}${fmt(stack.shareValueUsd, 2)}
          </div>
          <div className="mt-1 text-[12px] text-muted">
            {partial
              ? `${stack.unpriced.join(" and ")} ${stack.unpriced.length === 1 ? "has" : "have"} no price feed, so ${stack.unpriced.length === 1 ? "it is" : "they are"} not in this`
              : "Every leg priced by the oracle"}
          </div>
        </div>
        <div className="bg-ground p-6">
          <div className="panel-title">Shares outstanding</div>
          <div className="mt-3 text-[clamp(24px,2.6vw,34px)] font-semibold tracking-tighter text-ink">
            {fmt(stack.totalSupply, 4)}
          </div>
          <div className="mt-1 text-[12px] text-muted">
            {stack.frozen ? "Closed to new mints — redeeming still works" : "Anyone can mint or redeem"}
          </div>
        </div>
      </div>
      <p className="border-t border-line px-6 py-3 text-[12px] leading-snug text-faint">
        {stack.name}. The recipe is fixed at creation and cannot be changed, rebalanced
        or traded by anyone — including us. Every share is backed by the exact tokens it
        names, held in the vault and nowhere else.
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ */

/** The recipe, leg by leg: what one share costs and what the vault is holding. */
function Recipe({ stack }: { stack: StackRow }) {
  return (
    <section className="panel" aria-label="What is in this Stack">
      <div className="panel-head">
        <span className="panel-title">The recipe · one {stack.symbol} share</span>
        <a
          href={explorerAddress(stack.address) ?? undefined}
          target="_blank"
          rel="noreferrer noopener"
          className={`font-mono text-nano font-medium uppercase text-muted transition-colors hover:text-accent ${
            explorerAddress(stack.address) ? "" : "pointer-events-none opacity-0"
          }`}
        >
          Share token ↗
        </a>
      </div>

      <div className="divide-y divide-line">
        {stack.legs.map((leg) => (
          <Leg key={leg.address} leg={leg} />
        ))}
      </div>
    </section>
  );
}

function Leg({ leg }: { leg: StackLeg }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-5">
      <TokenMark symbol={leg.symbol} size={32} />
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold tracking-tight text-ink">{leg.symbol}</div>
        <div className="truncate text-[12px] text-faint">{leg.name}</div>
      </div>
      <div className="text-right">
        <div className="num text-[15px] text-ink">{fmt(leg.perShare, tokenDecimals(leg.perShare))}</div>
        <div className="text-[12px] text-faint">per share</div>
      </div>
      <div className="w-[104px] text-right">
        {leg.valuePerShareUsd === null ? (
          <>
            <div className="text-[15px] text-faint">—</div>
            <div className="text-[12px] text-faint">no price feed</div>
          </>
        ) : (
          <>
            <div className="num text-[15px] text-ink">${fmt(leg.valuePerShareUsd, 2)}</div>
            <div className="text-[12px] text-faint">at ${fmt(leg.priceUsd ?? 0, leg.priceUsd && leg.priceUsd < 1 ? 6 : 2)}</div>
          </>
        )}
      </div>
      <div className="w-full text-right text-[12px] text-faint sm:w-[150px]">
        Vault holds {fmt(leg.held, tokenDecimals(leg.held))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function MintPanel({ stack }: { stack: StackRow }) {
  const actions = useDataActions();
  const position = useStackPosition(stack.stackId);
  const [amount, setAmount] = useState("");

  const connected = actions.source === "chain";
  const shares = Number.parseFloat(amount) || 0;
  const maxMintable = position?.maxMintable ?? 0;

  // Every leg's cost, and whether the wallet covers it. Ceiling, like the vault: a
  // wallet holding exactly the floor amount cannot mint, and saying it can is how a
  // user gets a revert on the last transfer of a batch they already signed three
  // approvals for.
  const costs = stack.legs.map((leg) => {
    const held = position?.legs.find((l) => l.address.toLowerCase() === leg.address.toLowerCase());
    const need = ceil(leg.perShare * shares, leg.decimals);
    return { leg, need, have: held?.walletBalance ?? 0, short: shares > 0 && need > (held?.walletBalance ?? 0) };
  });

  const shortOf = costs.filter((c) => c.short);
  const valid = connected && shares > 0 && shortOf.length === 0 && !stack.frozen;

  async function submit() {
    if (!valid) return;
    await actions.stackMint(stack.stackId, shares);
    setAmount("");
  }

  return (
    <section className="panel self-start" aria-label={`Mint ${stack.symbol}`}>
      <div className="panel-head">
        <span className="panel-title">Mint {stack.symbol}</span>
        <span className="num text-micro font-bold uppercase text-muted">
          {connected ? `${fmt(maxMintable, 4)} affordable` : "Wallet not connected"}
        </span>
      </div>

      <div className="space-y-4 p-5">
        <div className="flex gap-2">
          <input
            className="field text-[16px]"
            inputMode="decimal"
            placeholder="0.0000"
            aria-label={`${stack.symbol} shares to mint`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button
            type="button"
            className="border border-line px-3 text-micro font-bold uppercase text-muted hover:text-ink"
            onClick={() => setAmount(maxMintable > 0 ? Math.floor(maxMintable * 1e4) / 1e4 + "" : "")}
          >
            Max
          </button>
        </div>

        <dl className="text-[13px]">
          {costs.map(({ leg, need, have, short }, i) => (
            <div
              key={leg.address}
              className={`flex items-start justify-between gap-4 py-2.5 ${
                i === costs.length - 1 ? "" : "border-b border-line"
              }`}
            >
              <dt className="min-w-0">
                <span className="text-muted">You hand over {leg.symbol}</span>
                {connected ? (
                  <span className={`mt-0.5 block text-[12px] ${short ? "text-accent" : "text-faint"}`}>
                    {short ? "you have " : "of "}
                    {fmt(have, tokenDecimals(have))} in your wallet
                  </span>
                ) : null}
              </dt>
              <dd className={`num shrink-0 ${short ? "text-accent" : "text-ink"}`}>
                {fmt(need, tokenDecimals(need))}
              </dd>
            </div>
          ))}
        </dl>

        <button
          type="button"
          className="btn-accent w-full"
          disabled={!valid || actions.busy}
          onClick={() => void submit()}
        >
          {!connected
            ? "Connect a wallet to mint"
            : stack.frozen
              ? "This Stack is closed to new mints"
              : shortOf.length > 0
                ? `Not enough ${shortOf.map((c) => c.leg.symbol).join(" and ")}`
                : `Mint ${stack.symbol}`}
        </button>
        <p className="text-[12px] leading-snug text-faint">
          One approval per ingredient, then the mint — {stack.legs.length + 1} signatures in
          one batch. Amounts round up by a hair so the vault is never left holding less
          than the shares say it should.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function YourShares({ stack }: { stack: StackRow }) {
  const actions = useDataActions();
  const position = useStackPosition(stack.stackId);
  const [amount, setAmount] = useState("");

  const balance = position?.balance ?? 0;

  if (balance === 0) {
    return (
      <section className="panel self-start p-8 text-[14px] leading-relaxed text-muted" aria-label="Your shares">
        You hold no {stack.symbol} yet. When you mint some, they show up here with what
        redeeming them would hand back.
      </section>
    );
  }

  const shares = Number.parseFloat(amount) || 0;
  const valid = shares > 0 && shares <= balance;

  async function submit() {
    if (!valid) return;
    await actions.stackRedeem(stack.stackId, shares);
    setAmount("");
  }

  return (
    <section className="panel self-start" aria-label="Your shares">
      <div className="panel-head">
        <span className="panel-title">Your {stack.symbol}</span>
        <span className="num text-micro font-bold uppercase text-muted">{fmt(balance, 4)} held</span>
      </div>

      <div className="space-y-4 p-5">
        <div className="flex gap-2">
          <input
            className="field text-[16px]"
            inputMode="decimal"
            placeholder="0.0000"
            aria-label={`${stack.symbol} shares to redeem`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button
            type="button"
            className="border border-line px-3 text-micro font-bold uppercase text-muted hover:text-ink"
            onClick={() => setAmount(Math.floor(balance * 1e4) / 1e4 + "")}
          >
            Max
          </button>
        </div>

        <dl className="text-[13px]">
          {stack.legs.map((leg, i) => (
            <div
              key={leg.address}
              className={`flex items-start justify-between gap-4 py-2.5 ${
                i === stack.legs.length - 1 ? "" : "border-b border-line"
              }`}
            >
              <dt className="text-muted">You get back {leg.symbol}</dt>
              <dd className="num shrink-0 text-ink">
                {/* Floor, like the vault's redeem. Quoting the round number and paying
                    a wei less is the kind of small lie that costs trust cheaply. */}
                {fmt(floor(leg.perShare * shares, leg.decimals), tokenDecimals(leg.perShare * shares))}
              </dd>
            </div>
          ))}
        </dl>

        <button
          type="button"
          className="btn-accent w-full"
          disabled={!valid || actions.busy}
          onClick={() => void submit()}
        >
          Redeem
        </button>
        <p className="text-[12px] leading-snug text-faint">
          One signature, no approval, no fee. Redeeming is never closed — even if the
          Stack stops accepting new mints, what you hold comes back.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Decimals to print an amount at.
 *
 * Ten thousand memecoins and a hundredth of a share both appear on this page, and one
 * fixed precision cannot serve both: four decimals on 10,000 is noise, and two on
 * 0.0100 is a rounded-away position.
 */
function tokenDecimals(n: number): number {
  const v = Math.abs(n);
  if (v === 0) return 2;
  if (v >= 1000) return 2;
  if (v >= 1) return 4;
  return 6;
}

/** Round up at the token's own precision, the way the vault's mint does. */
function ceil(n: number, decimals: number): number {
  const scale = 10 ** Math.min(decimals, 8);
  return Math.ceil(n * scale) / scale;
}

/** Round down at the token's own precision, the way the vault's redeem does. */
function floor(n: number, decimals: number): number {
  const scale = 10 ** Math.min(decimals, 8);
  return Math.floor(n * scale) / scale;
}

function HowItWorks() {
  return (
    <Steps
      label="How Stacks work"
      title="How Stacks work"
      steps={[
        {
          h: "A recipe, not a portfolio",
          p: "A Stack names a fixed quantity of each token per share — not a percentage. Nothing rebalances, nothing is bought or sold, and the weights drift with the market exactly as they would if you held the tokens yourself. That is the point: you are wrapping a position, not handing it to a manager.",
        },
        {
          h: "Minting is a deposit, not a trade",
          p: "You supply every ingredient in the recipe and the vault gives you one share per full set. No price is quoted and no swap happens, so there is no slippage, no spread and nothing to front-run. If you are short one ingredient, you buy it first — the Stack will not buy it for you.",
        },
        {
          h: "Redeeming always works",
          p: "Burn a share and the vault hands back exactly what that share put in. It can only ever pay out of its own ledger for that Stack, so one basket can never be drained to settle another. A Stack can be closed to new mints; it can never be closed to redemption.",
        },
        {
          h: "Some of what is inside has no price",
          p: "Equities on this chain have an oracle behind them. Memecoins do not, and are not going to. So wherever a Stack mixes the two, the dollar figure here counts only the legs that priced and says so — it is a floor, not a valuation. The token amounts are the exact truth; the dollars are the estimate.",
        },
      ]}
    />
  );
}
