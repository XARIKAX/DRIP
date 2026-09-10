"use client";

import { useState } from "react";
import { Steps } from "@/components/app/Steps";
import { AnimatedNumber, Countdown, fmt, shortDate } from "@/components/live";
import { TokenMark } from "@/components/TokenMark";
import {
  useDataActions,
  useSplitPosition,
  useSplitSeries,
  useSplitWalletBalance,
} from "@/lib/data/provider";
import type { SplitSeries } from "@/lib/data/types";

/**
 * Split: separating a stock from its dividends.
 *
 * The page has one job beyond the buttons, which is to make the mechanism legible.
 * A Robinhood Chain stock token pays no cash dividend — the dividend is reinvested
 * and the token's multiplier rises while the raw balance stays exactly where it was.
 * Almost nobody knows that, and without it the two tokens look arbitrary. So the
 * multiplier is on the page, in the open, with what it has earned since the series
 * opened, and every figure below is visibly derived from it.
 */
export default function SplitPage() {
  const series = useSplitSeries();
  const [selected, setSelected] = useState<number | null>(null);
  const active = series.find((s) => s.seriesId === selected) ?? series[0] ?? null;

  return (
    <div className="rise-group space-y-10" data-shot="split">
      <header className="max-w-3xl border-b border-line pb-8">
        <div className="serial">Own the share or own the dividend</div>
        <h1 className="mt-4 display text-display">Split</h1>
        <p className="mt-5 text-[16px] leading-relaxed text-muted">
          Your stock quietly earns its dividends into itself — no cash arrives, the shares
          behind each token just grow. Splitting cuts that in two. One token is the shares
          you started with, back in full on the end date. The other is everything they earn
          between now and then, yours to hold, sell, or cash out early.
        </p>
      </header>

      {active ? (
        <>
          {series.length > 1 ? (
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Pick a stock to split">
              {series.map((s) => {
                const on = s.seriesId === active.seriesId;
                return (
                  <button
                    key={s.seriesId}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setSelected(s.seriesId)}
                    className={`flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-semibold transition ${
                      on ? "bg-accent text-ground" : "border border-line text-muted hover:text-ink"
                    }`}
                  >
                    <TokenMark symbol={s.symbol} size={18} />
                    {s.symbol}
                  </button>
                );
              })}
            </div>
          ) : null}

          <SplitSeriesPage key={active.seriesId} series={active} />
        </>
      ) : (
        <section className="panel p-8 text-[14px] text-muted">
          No series are open yet. One opens per stock, with an end date.
        </section>
      )}

      <HowItWorks />
    </div>
  );
}

function SplitSeriesPage({ series }: { series: SplitSeries }) {
  return (
    <>
      <Meter series={series} />
      <div className="grid gap-8 lg:grid-cols-2">
        <SplitPanel series={series} />
        <YourPosition series={series} />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The multiplier, front and centre.
 *
 * This is the number the whole product rests on and it is invisible in every wallet,
 * so the page states it plainly: one token is worth this many shares, it was worth
 * this many when the series opened, and the gap is the dividend.
 */
function Meter({ series }: { series: SplitSeries }) {
  const earned = series.earnedPct;

  return (
    <section className="panel" aria-label="What this stock has earned">
      <div className="grid gap-px bg-line md:grid-cols-3">
        <div className="bg-ground p-6">
          <div className="panel-title">One {series.symbol} token is now</div>
          <div className="num mt-3 text-[clamp(24px,2.6vw,34px)] font-semibold tracking-tighter text-ink">
            {series.multiplier.toFixed(6)}
          </div>
          <div className="mt-1 text-[12px] text-muted">
            shares — it was {series.startMultiplier.toFixed(6)} when this series opened
          </div>
        </div>
        <div className="bg-ground p-6">
          <div className="panel-title">Earned since the series opened</div>
          <div className="mt-3 text-[clamp(24px,2.6vw,34px)] font-semibold tracking-tighter text-accent">
            <AnimatedNumber value={earned} decimals={4} suffix="%" flash="dark" />
          </div>
          <div className="mt-1 text-[12px] text-muted">
            {earned > 0
              ? "Dividends, reinvested into the token itself"
              : "No dividend has landed on this stock yet"}
          </div>
        </div>
        <div className="bg-ground p-6">
          <div className="panel-title">{series.frozen ? "Ended" : "Ends"}</div>
          <div className="mt-3 text-[clamp(24px,2.6vw,34px)] font-semibold tracking-tighter text-ink">
            {series.frozen ? "Closed" : <Countdown to={series.maturity} />}
          </div>
          <div className="mt-1 text-[12px] text-muted">
            {shortDate(series.maturity)} · {series.frozen ? "yield has stopped" : "yield stops here"}
          </div>
        </div>
      </div>
      <p className="border-t border-line px-6 py-3 text-[12px] leading-snug text-faint">
        Robinhood Chain stock tokens do not pay cash dividends. A dividend buys more stock
        and this multiplier goes up, while the number of tokens in your wallet never changes.
        That growth is the only yield here, and splitting decides who gets it.
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function SplitPanel({ series }: { series: SplitSeries }) {
  const actions = useDataActions();
  const walletStock = useSplitWalletBalance(series.symbol);
  const [amount, setAmount] = useState("");

  const raw = Number.parseFloat(amount) || 0;
  const valid = raw > 0 && raw <= walletStock && !series.frozen;
  const fee = (raw * series.splitFeeBps) / 10_000;
  const net = raw - fee;
  const ptOut = net * series.multiplier;

  async function submit() {
    if (!valid) return;
    await actions.split(series.seriesId, raw);
    setAmount("");
  }

  return (
    <section className="panel self-start" aria-label="Split">
      <div className="panel-head">
        <span className="panel-title">Split {series.symbol}</span>
        <span className="num text-micro font-bold uppercase text-muted">
          {fmt(walletStock, 4)} in your wallet
        </span>
      </div>

      <div className="space-y-4 p-5">
        <div className="flex gap-2">
          <input
            className="field text-[16px]"
            inputMode="decimal"
            placeholder="0.0000"
            aria-label={`${series.symbol} to split`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <button
            type="button"
            className="border border-line px-3 text-micro font-bold uppercase text-muted hover:text-ink"
            onClick={() => setAmount(walletStock > 0 ? walletStock.toFixed(4) : "")}
          >
            Max
          </button>
        </div>

        <dl className="text-[13px]">
          <Row
            label="Share tokens you get"
            value={fmt(ptOut, 4)}
            note="Redeems for the shares you put in, on the end date"
          />
          <Row
            label="Dividend tokens you get"
            value={fmt(net, 4)}
            note="Earns everything those shares make until then"
          />
          <Row label="Split fee" value={`${fmt(fee, 6)} ${series.symbol}`} note={`${series.splitFeeBps / 100}%`} last />
        </dl>

        <button
          type="button"
          className="btn-accent w-full"
          disabled={!valid || actions.busy}
          onClick={() => void submit()}
        >
          {series.frozen ? "This series has ended" : "Split"}
        </button>
        <p className="text-[12px] leading-snug text-faint">
          Changed your mind? Put the two back together at any time and get your stock back.
          No fee, no waiting.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function YourPosition({ series }: { series: SplitSeries }) {
  const position = useSplitPosition(series.seriesId);
  const actions = useDataActions();
  const [selling, setSelling] = useState(false);

  const pt = position?.ptBalance ?? 0;
  const yt = position?.ytBalance ?? 0;
  const principalStock = position?.principalStock ?? 0;
  const claimable = position?.claimableStock ?? 0;

  if (pt === 0 && yt === 0) {
    return (
      <section className="panel self-start p-8 text-[14px] leading-relaxed text-muted" aria-label="Your position">
        You have not split any {series.symbol} yet. When you do, both halves show up here
        with what each one is worth.
      </section>
    );
  }

  const matured = series.frozen || series.maturity * 1000 <= Date.now();
  const bid = series.ytBidUsd;
  const saleUsd = yt * bid;
  const canSell = bid > 0 && yt > 0 && saleUsd <= series.ytBudgetUsd;

  async function claim() {
    if (claimable <= 0) return;
    await actions.claimYield(series.seriesId);
  }

  async function sell() {
    if (!canSell) return;
    setSelling(true);
    try {
      // One percent of slippage on the seller's floor: the bid can be repriced
      // between building this and mining it, and a floor at the exact quote would
      // revert on a move of a single base unit.
      await actions.sellYield(series.seriesId, yt, saleUsd * 0.99);
    } finally {
      setSelling(false);
    }
  }

  return (
    <section className="panel self-start" aria-label="Your position">
      <div className="panel-head">
        <span className="panel-title">Your {series.symbol}</span>
        <span className="num text-micro font-bold uppercase text-muted">
          {matured ? "Ended" : "Running"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-px bg-line">
        <div className="bg-ground p-5">
          <div className="panel-title">Share tokens</div>
          <div className="num mt-2 text-[22px] font-semibold tracking-tight text-ink">{fmt(pt, 4)}</div>
          <div className="mt-1 text-[12px] text-muted">
            Redeems for {fmt(principalStock, 4)} {series.symbol}
          </div>
        </div>
        <div className="bg-ground p-5">
          <div className="panel-title">Dividend tokens</div>
          <div className="num mt-2 text-[22px] font-semibold tracking-tight text-accent">{fmt(yt, 4)}</div>
          <div className="mt-1 text-[12px] text-muted">
            Earned {fmt(claimable, 6)} {series.symbol} so far
          </div>
        </div>
      </div>

      <div className="space-y-3 p-5">
        <button
          type="button"
          className="btn-accent w-full"
          disabled={claimable <= 0 || actions.busy}
          onClick={() => void claim()}
        >
          {claimable > 0 ? `Collect ${fmt(claimable, 6)} ${series.symbol}` : "Nothing earned yet"}
        </button>

        {bid > 0 ? (
          <>
            <button
              type="button"
              className="btn-ghost w-full"
              disabled={!canSell || selling || actions.busy}
              onClick={() => void sell()}
            >
              {canSell
                ? `Sell your dividend tokens for $${fmt(saleUsd)}`
                : "The buyer is full for now"}
            </button>
            <p className="text-[12px] leading-snug text-faint">
              Cash today instead of waiting. Osinko pays ${fmt(bid, 4)} per dividend token and
              keeps whatever they go on to earn. You keep your share tokens either way.
            </p>
          </>
        ) : (
          <p className="text-[12px] leading-snug text-faint">
            Nobody is bidding for dividend tokens on this series right now. Hold them and
            collect what they earn, or put them back together with your share tokens.
          </p>
        )}

        {matured ? (
          <button
            type="button"
            className="btn-ghost w-full"
            disabled={pt <= 0 || actions.busy}
            onClick={() => void actions.redeemPrincipal(series.seriesId, pt)}
          >
            {pt > 0 ? `Take back ${fmt(principalStock, 4)} ${series.symbol}` : "Nothing to redeem"}
          </button>
        ) : (
          <button
            type="button"
            className="btn-ghost w-full"
            disabled={pt <= 0 || yt <= 0 || actions.busy}
            onClick={() => void actions.merge(series.seriesId, pt)}
          >
            Put them back together
          </button>
        )}
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  note,
  last = false,
}: {
  label: string;
  value: string;
  note?: string;
  last?: boolean;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 py-2.5 ${last ? "" : "border-b border-line"}`}>
      <dt className="min-w-0">
        <span className="text-muted">{label}</span>
        {note ? <span className="mt-0.5 block text-[12px] text-faint">{note}</span> : null}
      </dt>
      <dd className="num shrink-0 text-ink">{value}</dd>
    </div>
  );
}

function HowItWorks() {
  return (
    <Steps
      label="How splitting works"
      title="How splitting works"
      steps={[
        {
          h: "Your stock already earns, quietly",
          p: "Robinhood Chain stock tokens do not pay cash dividends. A dividend buys more of the stock, and each token comes to represent more shares. The count in your wallet never changes, so the growth is easy to miss — but it is there, and it is real.",
        },
        {
          h: "Splitting decides who gets that growth",
          p: "Split and you hold two things. Share tokens are locked to the shares you started with, so they are untouched by whatever the dividend does next. Dividend tokens take that growth, and only the growth that happens while you hold them.",
        },
        {
          h: "Sell either half, or neither",
          p: "Want cash for the dividend today? Sell the dividend tokens and keep your shares. Want the stock without the dividend? Sell the share tokens. Want it all back? Put the two together and your stock comes out whole, any time, free.",
        },
        {
          h: "Nothing here needs Osinko's money",
          p: "The dividend comes from the stock itself, not from a pot somebody has to fund. On the end date, share tokens redeem for exactly the shares they went in with, and everything the stock earned in between belongs to whoever held the dividend tokens.",
        },
      ]}
    />
  );
}
