"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { TokenMark } from "@/components/TokenMark";

/**
 * What the pointer carries.
 *
 * Portalled to `document.body` so no ancestor's `overflow: hidden` can clip it and no
 * ancestor's stacking context can bury it — the library scrolls, and a ghost trapped
 * inside that scroller would disappear the moment it left the list.
 *
 * `pointer-events: none` is load-bearing rather than tidy: without it the ghost is the
 * element under the cursor, and every hit test finds it instead of the ring.
 */
export function DragGhost({
  assetId,
  x,
  y,
}: {
  assetId: string | null;
  x: number;
  y: number;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || !assetId) return null;

  return createPortal(
    <div
      aria-hidden
      className="stack-ghost"
      style={{ transform: `translate3d(${x - 26}px, ${y - 26}px, 0) rotate(-3deg) scale(1.04)` }}
    >
      <span className="flex items-center gap-2.5 rounded-lg border border-line bg-paper py-2 pl-2 pr-4 shadow-float">
        <TokenMark symbol={assetId} size={34} />
        <span className="text-[13px] font-extrabold tracking-tight text-ink">{assetId}</span>
      </span>
    </div>,
    document.body
  );
}
