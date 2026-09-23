"use client";

import { forwardRef, useMemo, useState } from "react";

import { fmt } from "@/components/live";
import { MAX_ASSETS, type Allocation } from "@/lib/stack/allocation";
import { shortAddress, type BuilderAsset } from "@/lib/stack/asset";
import { stackAccent } from "@/lib/palette";
import { AssetMark } from "./AssetMark";

/**
 * The shelf you build from — now two shelves.
 *
 * Stocks come from the app's own data seam, the same list the Deposit page reads, so
 * nothing on that tab is invented: no made-up ticker, no placeholder price, no address
 * that does not exist. Imported tokens come from whatever somebody pasted upstairs, and
 * they live on their own tab because they are a different kind of claim — one is a
 * universe this protocol has verified, the other is a contract address a person vouched
 * for. Mixing them into one undifferentiated list would flatten that distinction, and it
 * is the distinction that matters most on this screen.
 *
 * Search crosses both tabs, because somebody typing "pons" should not first have to
 * work out which shelf it is on.
 */

export interface AssetLibraryProps {
  assets: BuilderAsset[];
  allocations: readonly Allocation[];
  onAdd: (asset: BuilderAsset) => void;
  onRemove: (assetId: string) => void;
  onPointerDown?: (event: React.PointerEvent, assetId: string) => void;
  draggingAssetId?: string | null;
}

type Tab = "stock" | "token";

export const AssetLibrary = forwardRef<HTMLInputElement, AssetLibraryProps>(
  function AssetLibrary(
    { assets, allocations, onAdd, onRemove, onPointerDown, draggingAssetId = null },
    searchRef
  ) {
    const [query, setQuery] = useState("");
    const [tab, setTab] = useState<Tab>("stock");

    const chosen = useMemo(
      () => new Map(allocations.map((a) => [a.assetId, a])),
      [allocations]
    );
    const full = allocations.length >= MAX_ASSETS;
    const importedCount = assets.filter((a) => a.kind === "token").length;

    // A search spans both shelves; an empty box shows whichever tab you are on.
    const results = useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return assets.filter((a) => a.kind === tab);
      return assets.filter(
        (a) =>
          a.symbol.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q) ||
          (a.address ?? "").toLowerCase().includes(q)
      );
    }, [assets, query, tab]);

    const searching = query.trim().length > 0;

    return (
      <section className="panel flex flex-col" aria-label="Choose your assets">
        <div className="panel-head">
          {/* The number is a column position, not a sequence. Below lg the chamber comes
              first, where "02" sitting above "01" is simply wrong; the names still read
              as steps without it. */}
          <span className="panel-title">
            <span className="hidden lg:inline">01 / </span>Choose your assets
          </span>
          <span className="serial">
            {allocations.length} of {MAX_ASSETS}
          </span>
        </div>

        <div className="space-y-3 px-4 pt-4">
          <div className="seg grid grid-cols-2" role="tablist" aria-label="Which shelf">
            {(["stock", "token"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t && !searching}
                onClick={() => {
                  setTab(t);
                  setQuery("");
                }}
                className="flex items-center justify-center gap-1.5"
              >
                {t === "stock" ? "Stocks" : "Imported"}
                {t === "token" && importedCount > 0 ? (
                  <span className="num rounded-full bg-accent/20 px-1.5 text-[10px] text-accent">
                    {importedCount}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          <div className="relative">
            <label htmlFor="stack-search" className="sr-only">
              Search stocks and tokens by ticker, name or address
            </label>
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
              placeholder="Search stocks and tokens"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="dark-scroll mt-3 flex-1 overflow-y-auto px-3 pb-3" style={{ maxHeight: 470 }}>
          {results.length === 0 ? (
            <EmptyShelf
              query={query.trim()}
              tab={tab}
              searching={searching}
              onClear={() => setQuery("")}
            />
          ) : (
            <ul className="space-y-1">
              {results.map((asset) => {
                const allocation = chosen.get(asset.id);
                return (
                  <AssetRow
                    key={asset.id}
                    asset={asset}
                    allocation={allocation}
                    disabled={!allocation && full}
                    dragging={draggingAssetId === asset.id}
                    onAdd={() => onAdd(asset)}
                    onRemove={() => onRemove(asset.id)}
                    onPointerDown={onPointerDown}
                  />
                );
              })}
            </ul>
          )}
        </div>

        <p className="border-t border-line px-4 py-3 text-[12px] leading-relaxed text-faint">
          {full
            ? `Six is the most a Stack holds. Take one out to swap it.`
            : `Drag an asset into the ring, or press Add.`}
        </p>
      </section>
    );
  }
);

function EmptyShelf({
  query,
  tab,
  searching,
  onClear,
}: {
  query: string;
  tab: Tab;
  searching: boolean;
  onClear: () => void;
}) {
  if (searching) {
    return (
      <p className="px-2 py-10 text-center text-[13px] leading-relaxed text-muted">
        Nothing matches “{query}”.
        <br />
        <button
          type="button"
          className="mt-2 text-micro font-bold uppercase text-accent underline decoration-accent/40 decoration-2 underline-offset-4"
          onClick={onClear}
        >
          Show everything
        </button>
      </p>
    );
  }
  return (
    <p className="px-4 py-10 text-center text-[13px] leading-relaxed text-muted">
      {tab === "token"
        ? "Nothing imported yet. Paste a contract address up top and it lands here."
        : "No stocks to show."}
    </p>
  );
}

function AssetRow({
  asset,
  allocation,
  disabled,
  dragging,
  onAdd,
  onRemove,
  onPointerDown,
}: {
  asset: BuilderAsset;
  allocation: Allocation | undefined;
  disabled: boolean;
  dragging: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onPointerDown?: (event: React.PointerEvent, assetId: string) => void;
}) {
  const chosen = Boolean(allocation);
  const sub = asset.note ? `${asset.name} · ${asset.note}` : asset.name;

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
        onPointerDown(e, asset.id);
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
        <AssetMark asset={asset} size={34} slot={allocation?.slot ?? 0} />
        {allocation ? (
          <span
            aria-hidden
            className="absolute -bottom-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-ground"
            style={{ background: stackAccent(allocation.slot, allocation.kind) }}
          />
        ) : null}
      </span>

      <span className="min-w-0 flex-1">
        {/* The ticker never truncates — "GOO…" names nothing, and it is the shorter of
            the two strings anyway. The subtitle is what gives way. */}
        <span className="block text-[14px] font-extrabold tracking-tight text-ink">
          {asset.symbol}
        </span>
        <span className="block truncate text-[12px] text-muted">{sub}</span>
      </span>

      <span className="num shrink-0 text-right text-[12px] text-muted">
        {asset.priceUsd === null ? (
          asset.kind === "token" ? (
            <span className="text-[11px]">{shortAddress(asset.address ?? "")}</span>
          ) : (
            "—"
          )
        ) : (
          `$${fmt(asset.priceUsd, asset.priceUsd < 1 ? 4 : 2)}`
        )}
      </span>

      {chosen ? (
        <button
          type="button"
          onClick={onRemove}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent/50 bg-accent/20 text-accent transition-colors hover:border-accent hover:bg-accent hover:text-accent-ink"
        >
          <span className="sr-only">Take {asset.symbol} out of your Stack</span>
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
          <span className="sr-only">Add {asset.name} to your Stack</span>
          <span aria-hidden>Add</span>
        </button>
      )}
    </li>
  );
}
