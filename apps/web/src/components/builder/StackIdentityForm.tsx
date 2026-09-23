"use client";

import { fmt } from "@/components/live";
import { toPct, type Allocation } from "@/lib/stack/allocation";
import type { StackCapability } from "@/lib/stack/capability";
import type { TokenInfo } from "@/lib/data/types";
import type { BuilderAsset } from "@/lib/stack/asset";
import { StackPreviewCard } from "./StackPreviewCard";

/**
 * Naming the idea, and the two things you can do with it once it has a name.
 *
 * The summary underneath is where this feature has to be most careful. It is drawn
 * against a figure the person chose, and that figure buys nothing — so it says
 * "illustration", shows an em dash wherever the oracle will not answer, and never adds
 * up an unpriceable stock as though it were free. A total that silently shrinks when a
 * feed goes quiet is worse than no total, and this is somebody's money being described.
 */

export const NAME_MAX = 40;
export const TICKER_MAX = 10;

export interface StackIdentityFormProps {
  name: string;
  ticker: string;
  illustrativeUsd: number;
  allocations: readonly Allocation[];
  tokens: TokenInfo[];
  assets: ReadonlyMap<string, BuilderAsset>;
  capability: StackCapability;
  saving: boolean;
  onName: (value: string) => void;
  onTicker: (value: string) => void;
  onIllustrativeUsd: (value: number) => void;
  onReview: () => void;
  onSaveDraft: () => void;
}

/** Uppercase, letters and digits only, and it has to start with a letter. */
export function normaliseTicker(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/^[0-9]+/, "")
    .slice(0, TICKER_MAX);
}

export function nameError(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length < 2) return "A name needs at least two characters.";
  return null;
}

export function tickerError(ticker: string): string | null {
  if (ticker.length === 0) return null;
  if (ticker.length < 2) return "A ticker needs at least two characters.";
  return null;
}

export function isReady(name: string, ticker: string, allocations: readonly Allocation[]): boolean {
  return (
    name.trim().length >= 2 &&
    ticker.length >= 2 &&
    allocations.length > 0 &&
    !nameError(name) &&
    !tickerError(ticker)
  );
}

export function StackIdentityForm({
  name,
  ticker,
  illustrativeUsd,
  allocations,
  tokens,
  assets,
  capability,
  saving,
  onName,
  onTicker,
  onIllustrativeUsd,
  onReview,
  onSaveDraft,
}: StackIdentityFormProps) {
  void tokens;
  const unpriced = allocations.filter((a) => assets.get(a.assetId)?.priceUsd == null);
  const labelOf = (id: string) => assets.get(id)?.symbol ?? id;
  const ready = isReady(name, ticker, allocations);
  const nameMsg = nameError(name);
  const tickerMsg = tickerError(ticker);

  return (
    <section className="panel flex flex-col" aria-label="Make it yours">
      <div className="panel-head">
        <span className="panel-title">
          <span className="hidden lg:inline">03 / </span>Make it yours
        </span>
      </div>

      <div className="space-y-4 px-5 py-5">
        <div>
          <label htmlFor="stack-name" className="serial block">
            Stack name
          </label>
          <input
            id="stack-name"
            className="field mt-2 py-2.5 font-sans text-[14px]"
            placeholder="Name your idea"
            maxLength={NAME_MAX}
            value={name}
            aria-invalid={Boolean(nameMsg) || undefined}
            aria-describedby={nameMsg ? "stack-name-msg" : undefined}
            onChange={(e) => onName(e.target.value.slice(0, NAME_MAX))}
          />
          {nameMsg ? (
            <p id="stack-name-msg" className="mt-1.5 text-[12px] text-down">
              {nameMsg}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="stack-ticker" className="serial block">
            Ticker
          </label>
          <div className="relative mt-2">
            <span
              aria-hidden
              className="num pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[14px] text-faint"
            >
              $
            </span>
            <input
              id="stack-ticker"
              className="field py-2.5 pl-7 text-[14px] uppercase"
              placeholder="ROBOT"
              maxLength={TICKER_MAX}
              value={ticker}
              aria-invalid={Boolean(tickerMsg) || undefined}
              aria-describedby="stack-ticker-help"
              onChange={(e) => onTicker(normaliseTicker(e.target.value))}
            />
          </div>
          <p id="stack-ticker-help" className={`mt-1.5 text-[12px] ${tickerMsg ? "text-down" : "text-faint"}`}>
            {tickerMsg ?? "Two to ten letters or numbers, starting with a letter."}
          </p>
        </div>

        <StackPreviewCard
          name={name}
          ticker={ticker}
          allocations={allocations}
          assets={assets}
        />
      </div>

      {/* The summary. Everything in it is derived and labelled as such. */}
      <dl className="border-t border-line px-5 py-1 text-[13px]">
        <Row label="Drawn against">
          <span className="inline-flex items-center gap-1">
            <span aria-hidden className="text-faint">$</span>
            <input
              className="field num w-[92px] py-1 text-right text-[13px]"
              inputMode="decimal"
              aria-label="Illustrative amount, in dollars"
              value={illustrativeUsd}
              onChange={(e) => {
                const v = Number(e.target.value.replace(/[^0-9.]/g, ""));
                onIllustrativeUsd(Number.isFinite(v) && v > 0 ? v : 0);
              }}
            />
          </span>
        </Row>
        <Row label="Assets">{allocations.length}</Row>
        <Row label="Biggest holding">
          {allocations.length === 0
            ? "—"
            : (() => {
                const top = [...allocations].sort((a, b) => b.weightBps - a.weightBps)[0]!;
                return `${labelOf(top.assetId)} ${toPct(top.weightBps)}%`;
              })()}
        </Row>
        <Row label="Backed by">Stocks and tokens you hold</Row>
      </dl>

      {unpriced.length > 0 ? (
        <p className="mx-5 mb-3 rounded-md border border-line bg-ground-3 px-3 py-2.5 text-[12px] leading-relaxed text-muted">
          No price right now for {unpriced.map((a) => labelOf(a.assetId)).join(", ")}. You can still
          design with {unpriced.length === 1 ? "it" : "them"} — there is just nothing to
          value {unpriced.length === 1 ? "it" : "them"} at yet.
        </p>
      ) : null}

      <div className="mt-auto space-y-3 border-t border-line px-5 py-5">
        <button type="button" className="btn-accent w-full" disabled={!ready} onClick={onReview}>
          Preview your Stack
        </button>
        <button type="button" className="btn-quiet w-full" onClick={onSaveDraft}>
          {saving ? "Saved" : "Save draft"}
        </button>
        <p className="text-[12px] leading-relaxed text-faint">
          {capability.mint.kind === "preview-only"
            ? "Preview only. This makes a picture and a plan. Stacks are not a token you can hold yet."
            : null}
        </p>
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
      <dt className="text-micro font-bold uppercase text-muted">{label}</dt>
      <dd className="num text-right font-medium text-ink">{children}</dd>
    </div>
  );
}

/** What the Stack is worth at the illustrative figure, or null when it cannot be said. */
export function illustrativeValue(
  allocations: readonly Allocation[],
  tokens: TokenInfo[],
  usd: number
): { perAsset: { assetId: string; usd: number; shares: number | null }[]; unpriced: string[] } {
  const priceOf = new Map(tokens.map((t) => [t.symbol, t.priceUsd]));
  const unpriced: string[] = [];

  const perAsset = allocations.map((a) => {
    const price = priceOf.get(a.assetId) ?? null;
    const slice = (usd * a.weightBps) / 10_000;
    if (price === null || price <= 0) {
      unpriced.push(a.assetId);
      return { assetId: a.assetId, usd: slice, shares: null };
    }
    return { assetId: a.assetId, usd: slice, shares: slice / price };
  });

  return { perAsset, unpriced };
}

/** A dollar figure, or an em dash when there is nothing honest to print. */
export function usdOrDash(value: number | null): string {
  return value === null ? "—" : `$${fmt(value)}`;
}
