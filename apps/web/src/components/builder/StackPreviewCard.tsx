"use client";

import { Mark } from "@/components/Wordmark";
import type { BuilderAsset } from "@/lib/stack/asset";
import { formatPct, type Allocation } from "@/lib/stack/allocation";
import { stackAccent } from "@/lib/palette";
import { AllocationRing } from "./AllocationRing";

/**
 * The thing worth sharing.
 *
 * Same geometry module as the big ring, so the card is a true miniature rather than a
 * second drawing of the same idea — and so the PNG the export paints is a photograph of
 * something the person has already seen, not an approximation of it.
 *
 * It carries a PREVIEW mark because that is what it is. Nothing here is minted, nothing
 * is owned, and a card that let somebody believe otherwise would be the worst thing this
 * feature could produce. The mark stays on until a Stack can actually exist, which in
 * this repo is not yet.
 */

export interface StackPreviewCardProps {
  name: string;
  ticker: string;
  allocations: readonly Allocation[];
  assets?: ReadonlyMap<string, BuilderAsset>;
  className?: string;
}

export function StackPreviewCard({
  name,
  ticker,
  allocations,
  assets,
  className = "",
}: StackPreviewCardProps) {
  return (
    <div
      className={`night relative overflow-hidden rounded-lg border border-line bg-ground p-5 ${className}`}
      data-shot="builder-card"
    >
      {/* A wash so the card has a light source, like every other night surface here. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(90% 70% at 78% 0%, rgb(var(--iris-500) / 0.22), transparent 70%)",
        }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="serial truncate">{name.trim() || "Untitled Stack"}</div>
          <div className="num mt-1 text-[26px] font-semibold leading-none tracking-tighter text-ink">
            ${ticker || "—"}
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-ink">
          <Mark size={15} />
          <span className="display text-[13px] leading-none">Osinko</span>
        </span>
      </div>

      <div className="relative mt-4 flex items-center gap-4">
        <ul className="min-w-0 flex-1 space-y-1.5">
          {allocations.length === 0 ? (
            <li className="text-[12px] text-muted">Nothing in it yet.</li>
          ) : (
            allocations.map((a) => (
              <li key={a.assetId} className="flex items-center gap-2 text-[12px]">
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: stackAccent(a.slot, a.kind) }}
                />
                {/* The ticker never truncates — it is the thing being named, and
                    "GOO…" identifies nothing. The row gives way on the gap instead. */}
                <span className="shrink-0 font-semibold text-ink">
                  {assets?.get(a.assetId)?.symbol ?? a.assetId}
                </span>
                <span className="num ml-auto shrink-0 text-muted">
                  {formatPct(a.weightBps)}%
                </span>
              </li>
            ))
          )}
        </ul>

        <div className="relative aspect-square w-[108px] shrink-0">
          <AllocationRing allocations={allocations} thicknessPct={19} glow={false} />
          <span className="absolute inset-0 flex items-center justify-center text-ink/70">
            <Mark size={20} />
          </span>
        </div>
      </div>

      <div className="relative mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
        <span className="serial">Preview</span>
        <span className="text-[11px] text-faint">A plan, not a token</span>
      </div>
    </div>
  );
}
