"use client";

import { forwardRef, useMemo, useState } from "react";

import { TokenMark } from "@/components/TokenMark";
import { fmt } from "@/components/live";
import { MAX_ASSETS, type Allocation } from "@/lib/stack/allocation";
import { stackAccent } from "@/lib/palette";
import type { TokenInfo } from "@/lib/data/types";

/**
 * The shelf you build from.
 *
 * Every stock here comes from `useTokensView()` — the app's own data seam, the same list
 * the Deposit page reads. Nothing in this panel is invented: no made-up ticker, no
 * placeholder price, no address that does not exist. A stock the oracle will not price
 * shows a dash rather than a number, because "we cannot price this right now" and "this
 * is worthless" are different sentences and only one of them is true.
 *
 * There are no sector filters, and their absence is deliberate. The reference design has
 * All / Tech / Consumer chips, but neither `TokenInfo` nor the listing universe carries
 * a sector — so those chips could only be a hand-written table of opinions dressed up as
 * registry data, and one that would go stale the first time a stock was added. Search
 * covers the same need honestly.
 */

export interface AssetLibraryProps {
  tokens: TokenInfo[];
  allocations: readonly Allocation[];
  onAdd: (assetId: string) => void;
  onRemove: (assetId: string) => void;
  /** Starts a drag. Absent on touch layouts, where there is nothing to drag to. */
  onPointerDown?: (event: React.PointerEvent, assetId: string) => void;
  /** The asset currently being carried, so its row can dim. */
  draggingAssetId?: string | null;
}

export const AssetLibrary = forwardRef<HTMLInputElement, AssetLibraryProps>(
  function AssetLibrary(
    { tokens, allocations, onAdd, onRemove, onPointerDown, draggingAssetId = null },
    searchRef
  ) {
    const [query, setQuery] = useState("");

    const chosen = useMemo(
      () => new Map(allocations.map((a) => [a.assetId, a])),
      [allocations]
    );
    const full = allocations.length >= MAX_ASSETS;

    // Ticker or company name, either case. Somebody who knows it as "Nvidia" should not
    // have to know it as NVDA.
    const results = useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return tokens;
      return tokens.filter(
        (t) => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q)
      );
    }, [tokens, query]);

    return (
      <section className="panel flex flex-col" aria-label="Choose your stocks">
        <div className="panel-head">
          {/* The number is a column position, not a sequence. Below lg the chamber comes
              first, where "02" sitting above "01" is simply wrong; the names still read
              as steps without it. */}
          <span className="panel-title">
            <span className="hidden lg:inline">01 / </span>Choose your stocks
          </span>
          <span className="serial">
            {allocations.length} of {MAX_ASSETS}
          </span>
        </div>

        <div className="px-4 pt-4">
          <label htmlFor="stack-search" className="sr-only">
            Search stocks by ticker or company name
          </label>
          <div className="relative">
            <svg
              viewBox="0 0 16 16"
              width="15"
              height="15"
              fill="none"
              aria-hidden
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
            >
              <circle cx="7" cy="7" r="4.6" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10.4 10.4 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              id="stack-search"
              ref={searchRef}
              type="search"
              className="field py-2.5 pl-10 text-[13px]"
              placeholder="Search stocks"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="dark-scroll mt-3 flex-1 overflow-y-auto px-3 pb-3" style={{ maxHeight: 520 }}>
          {results.length === 0 ? (
            <p className="px-2 py-10 text-center text-[13px] leading-relaxed text-muted">
              Nothing matches “{query.trim()}”.
              <br />
              <button
                type="button"
                className="mt-2 text-micro font-bold uppercase text-accent underline decoration-accent/40 decoration-2 underline-offset-4"
                onClick={() => setQuery("")}
              >
                Show every stock
              </button>
            </p>
          ) : (
            <ul className="space-y-1">
              {results.map((token) => {
                const allocation = chosen.get(token.symbol);
                return (
                  <AssetRow
                    key={token.symbol}
                    token={token}
                    allocation={allocation}
                    disabled={!allocation && full}
                    dragging={draggingAssetId === token.symbol}
                    onAdd={() => onAdd(token.symbol)}
                    onRemove={() => onRemove(token.symbol)}
                    onPointerDown={onPointerDown}
                  />
                );
              })}
            </ul>
          )}
        </div>

        <p className="border-t border-line px-4 py-3 text-[12px] leading-relaxed text-faint">
          {full
            ? `Five is the most a Stack holds. Take one out to swap it.`
            : `Drag a stock into the ring, or press Add.`}
        </p>
      </section>
    );
  }
);

function AssetRow({
  token,
  allocation,
  disabled,
  dragging,
  onAdd,
  onRemove,
  onPointerDown,
}: {
  token: TokenInfo;
  allocation: Allocation | undefined;
  disabled: boolean;
  dragging: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onPointerDown?: (event: React.PointerEvent, assetId: string) => void;
}) {
  const chosen = Boolean(allocation);

  return (
    <li
      // `pan-y` and not `none`: the list has to keep scrolling under a thumb. This says
      // vertical belongs to the browser and horizontal belongs to the drag recogniser,
      // which is exactly the deal the threshold check makes.
      className={`group relative flex items-center gap-3 rounded-md border px-3 py-2.5 transition-all duration-150 ease-osk [touch-action:pan-y] ${
        chosen
          ? "border-accent/40 bg-accent/10"
          : disabled
            ? "border-transparent opacity-40"
            : "border-transparent hover:-translate-y-[2px] hover:border-line hover:bg-ground-3"
      } ${dragging ? "opacity-40" : ""}`}
      onPointerDown={(e) => {
        if (disabled || !onPointerDown) return;
        onPointerDown(e, token.symbol);
      }}
    >
      <span
        aria-hidden
        className={`shrink-0 text-faint ${onPointerDown && !disabled ? "cursor-grab" : ""}`}
      >
        <svg viewBox="0 0 10 16" width="10" height="16" fill="currentColor">
          <circle cx="2" cy="3" r="1.3" />
          <circle cx="8" cy="3" r="1.3" />
          <circle cx="2" cy="8" r="1.3" />
          <circle cx="8" cy="8" r="1.3" />
          <circle cx="2" cy="13" r="1.3" />
          <circle cx="8" cy="13" r="1.3" />
        </svg>
      </span>

      <span className="relative shrink-0">
        <TokenMark symbol={token.symbol} size={34} />
        {allocation ? (
          <span
            aria-hidden
            className="absolute -bottom-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-ground"
            style={{ background: stackAccent(allocation.slot) }}
          />
        ) : null}
      </span>

      <span className="min-w-0 flex-1">
        {/* The ticker never truncates — "GOO…" names nothing, and it is the shorter of
            the two strings anyway. The company name is what gives way. */}
        <span className="block text-[14px] font-extrabold tracking-tight text-ink">
          {token.symbol}
        </span>
        <span className="block truncate text-[12px] text-muted">{token.name}</span>
      </span>

      <span className="num shrink-0 text-[12px] text-muted">
        {token.priceUsd === null ? "—" : `$${fmt(token.priceUsd)}`}
      </span>

      {chosen ? (
        <button
          type="button"
          onClick={onRemove}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent/50 bg-accent/20 text-accent transition-colors hover:border-accent hover:bg-accent hover:text-accent-ink"
        >
          <span className="sr-only">Take {token.symbol} out of your Stack</span>
          <svg viewBox="0 0 14 14" width="12" height="12" fill="none" aria-hidden>
            <path
              d="M2.5 7.2 5.6 10.3 11.5 4"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="group-hover:hidden"
            />
            <path
              d="M3.5 3.5 10.5 10.5M10.5 3.5 3.5 10.5"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              className="hidden group-hover:block"
            />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          onClick={onAdd}
          disabled={disabled}
          className="btn-quiet btn-sm shrink-0 px-3 py-1.5 text-[11px] disabled:pointer-events-none"
        >
          <span className="sr-only">Add {token.name} to your Stack</span>
          <span aria-hidden>Add</span>
        </button>
      )}
    </li>
  );
}
