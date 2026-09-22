"use client";

import { useEffect, useRef, useState } from "react";

import { Mark } from "@/components/Wordmark";
import { TokenMark } from "@/components/TokenMark";
import { formatPct, type Allocation } from "@/lib/stack/allocation";
import { showBadgeWeights } from "@/lib/stack/geometry";
import { stackAccent } from "@/lib/palette";
import { AllocationRing } from "./AllocationRing";

/**
 * The chamber: a dark stage with a ring in it, and the one place a stock can be dropped.
 *
 * Nine layers, stacked back to front — wash, grid, halo, drop ring, bloom, ring, tracks,
 * hub, badges. They are separate elements rather than one clever background because they
 * have to move independently: the halo breathes, the outer track turns, the ring tweens,
 * and the badges hold logos that must stay sharp. One element cannot do all of that.
 *
 * Two of those layers are blurred, and both are deliberately childless. `filter: blur()`
 * blurs every descendant and forces the subtree onto its own composited layer, which
 * softens text even at radius zero. So the hub sits *above* the blurred layers and is
 * never inside one. There is no version of this where the glow contains the ticker.
 *
 * Every decorative layer is marked `aria-hidden` **individually**, and the stage that
 * holds them is not. That distinction matters and was a bug here first: `aria-hidden` on
 * an ancestor hides its whole subtree, and a descendant cannot opt back in — so hiding
 * the stage wholesale took the empty state's *Try an example* button with it, leaving a
 * control that was visible, clickable and completely unreachable by assistive tech. The
 * art is decorative; the buttons inside it are not.
 *
 * What the ring shows is said properly by the controls beneath it: real labelled sliders
 * and fields carrying the same numbers. That is why the ornament can be silent.
 */

export interface AllocationChamberProps {
  allocations: readonly Allocation[];
  ticker: string;
  /** True while a draggable stock is over the drop ring. */
  dropActive?: boolean;
  /** Pulsed when somebody drops a stock that is already in the Stack. */
  bumpedAssetId?: string | null;
  /** The `+` badge and the empty state both call this. */
  onRequestAdd?: () => void;
  /** Loading the example composition. Only shown while the Stack is empty. */
  onTryExample?: () => void;
}

export function AllocationChamber({
  allocations,
  ticker,
  dropActive = false,
  bumpedAssetId = null,
  onRequestAdd,
  onTryExample,
}: AllocationChamberProps) {
  const stage = useRef<HTMLDivElement | null>(null);
  const [stagePx, setStagePx] = useState(520);
  const empty = allocations.length === 0;

  // The badges drop their weight pills when the ring is too small to hold them
  // legibly. That is a measurement, not a breakpoint: the stage is sized with clamp()
  // against its column, so the same viewport gives it different widths on different
  // layouts and a media query would guess wrong.
  useEffect(() => {
    const node = stage.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width;
      if (width) setStagePx(width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const withPills = showBadgeWeights(stagePx, allocations.length);
  const badgeSize = stagePx < 340 ? 28 : stagePx < 440 ? 34 : 40;

  return (
    <div
      className="relative flex items-center justify-center px-4 py-5 sm:px-6 sm:py-7"
      data-drop-target="chamber"
    >
      {/*
       * The stage. Square, capped, and the origin for every percentage inside it.
       *
       * The cap is what keeps the primary action reachable: the ring is the best thing
       * on this page, but a 560px circle plus five control rows pushes "Preview your
       * Stack" off a 1000px screen, and a beautiful instrument nobody can finish using
       * is not a good trade.
       */}
      <div
        ref={stage}
        className="stack-stage"
        style={{ "--stage": "min(100%, 440px)" } as React.CSSProperties}
      >
        {/* 1 — the wash. A light source above the ring, so the chamber has a top. */}
        <div
          aria-hidden
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(62% 62% at 50% 36%, rgb(var(--iris-500) / 0.20), transparent 72%)",
          }}
        />

        {/* 2 — graph paper, fading out before the rim. */}
        <div aria-hidden className="stack-grid absolute inset-0 [--cell:4px]" />

        {/* 3 — the halo. Empty by construction: it is blurred. */}
        <div
          aria-hidden
          className="stack-halo absolute inset-[14%] rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgb(var(--iris-500) / 0.45), transparent 70%)",
          }}
        />

        {/* 4 — the drop ring, and the outer decorative track that turns inside it. */}
        <div
          aria-hidden
          className="stack-drop absolute inset-0 rounded-full"
          data-active={dropActive ? "true" : "false"}
        />
        <div
          aria-hidden
          className="stack-orbit absolute inset-[7%] rounded-full border border-dashed border-line-soft"
        />

        {/* 5–8 — bloom, ring, and the badges that ride on it. */}
        <AllocationRing
          allocations={allocations}
          className="inset-[13%]"
          thicknessPct={15}
          badgeRadiusPct={50}
          renderBadge={(allocation) => (
            <Badge
              allocation={allocation}
              size={badgeSize}
              withPill={withPills}
              bumped={allocation.assetId === bumpedAssetId}
            />
          )}
        />

        {/* 9 — the inner track and the hub. Above every blurred layer, never inside one. */}
        <div aria-hidden className="absolute inset-[33%] rounded-full border border-line-soft" />
        <Hub ticker={ticker} empty={empty} onTryExample={onTryExample} />
      </div>

      {/* The `+`. A real button, because the keyboard has no pointer to drop with —
          it sends focus to the search field, which is where a keyboard add begins. */}
      {onRequestAdd ? (
        <button
          type="button"
          onClick={onRequestAdd}
          className="group absolute left-1/2 top-2 z-[3] flex -translate-x-1/2 flex-col items-center gap-2 sm:top-4"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-ground-3 text-[18px] leading-none text-muted transition-colors duration-200 group-hover:border-accent group-hover:text-accent">
            +
          </span>
          <span className="serial transition-colors duration-200 group-hover:text-muted">
            {allocations.length === 0 ? "Add a stock" : "Add another"}
          </span>
        </button>
      ) : null}
    </div>
  );
}

/**
 * The middle of the ring: the mark, the ticker, and what it is.
 *
 * When the Stack is empty this is where the invitation lives, because the eye is
 * already here — the ring has drawn a circle around it.
 */
function Hub({
  ticker,
  empty,
  onTryExample,
}: {
  ticker: string;
  empty: boolean;
  onTryExample?: () => void;
}) {
  return (
    <div className="absolute inset-[33%] flex flex-col items-center justify-center gap-1.5 rounded-full px-3 text-center">
      {empty ? (
        <>
          <span className="text-[13px] font-semibold leading-tight text-muted">
            Drop your first stock
          </span>
          {onTryExample ? (
            <button
              type="button"
              onClick={onTryExample}
              className="text-micro font-bold uppercase text-accent underline decoration-accent/40 decoration-2 underline-offset-4 transition-colors hover:decoration-accent"
            >
              Try an example
            </button>
          ) : null}
        </>
      ) : (
        // Decorative: the ticker field and the controls below already say all of this.
        <span aria-hidden className="flex flex-col items-center gap-1.5">
          <Mark size={20} className="text-accent" />
          <span className="num text-[clamp(17px,3.6vw,26px)] font-semibold leading-none tracking-tighter text-ink">
            ${ticker || "—"}
          </span>
          <span className="serial">Your Stack</span>
        </span>
      )}
    </div>
  );
}

/** A logo on the ring, with its share under it. */
function Badge({
  allocation,
  size,
  withPill,
  bumped,
}: {
  allocation: Allocation;
  size: number;
  withPill: boolean;
  bumped: boolean;
}) {
  const accent = stackAccent(allocation.slot);

  return (
    <span className="flex flex-col items-center gap-1">
      <span
        className="flex items-center justify-center rounded-full p-[3px] transition-transform duration-300 ease-osk"
        style={{
          background: `rgb(var(--night-2))`,
          boxShadow: `0 0 0 2px ${accent}, 0 6px 18px -8px ${accent}`,
          transform: bumped ? "scale(1.14)" : undefined,
        }}
      >
        <TokenMark symbol={allocation.assetId} size={size} />
      </span>
      {withPill ? (
        <span
          className="num rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none"
          style={{ background: "rgb(var(--night-1) / 0.92)", color: accent }}
        >
          {formatPct(allocation.weightBps)}%
        </span>
      ) : null}
    </span>
  );
}
