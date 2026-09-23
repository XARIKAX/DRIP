"use client";

import { useEffect, useRef } from "react";

import { TOTAL_BPS, type Allocation } from "@/lib/stack/allocation";
import { badgePoints, ringBackground, segments } from "@/lib/stack/geometry";
import { stackAccent } from "@/lib/palette";
import { usePrefersReducedMotion } from "@/components/motion";

/**
 * The donut, and the thing that makes it move.
 *
 * Two problems meet in this component, and both push the same way.
 *
 * **A conic gradient will not transition.** It is a string, not a number, so the browser
 * has nothing to interpolate between `conic-gradient(green 0deg, green 180deg, …)` and
 * the next one. Dragging a slider against a plain re-render gives a ring that snaps
 * through every intermediate value like a slideshow.
 *
 * **A slider drag is a firehose.** It emits a value per pointer move, and a 60fps tween
 * on top emits a frame per frame. Routing either through React state re-renders the page
 * that owns the allocations — the library, the controls, the identity form, the preview
 * card — sixty times a second, to move one background.
 *
 * So the tween lives outside React entirely. `displayed` is a ref holding the weights
 * currently painted; a rAF loop eases it toward the real ones and writes the gradient
 * straight onto the element's `style`. React renders this component when the *set* of
 * assets changes; it does not render it while a weight is moving. The DOM the loop
 * writes to and the DOM React owns are deliberately different properties of the same
 * nodes — React owns the children, the loop owns `background` and `left`/`top` — so
 * neither ever clobbers the other.
 */

export interface AllocationRingProps {
  allocations: readonly Allocation[];
  /** Ring thickness as a percentage of the square's width. */
  thicknessPct?: number;
  /** Where badge centres sit, as a percentage. Zero hides them — the card does this. */
  badgeRadiusPct?: number;
  /** Rendered into each badge. Lets the big ring use logos and the card use dots. */
  renderBadge?: (allocation: Allocation, index: number) => React.ReactNode;
  /** Painted behind the ring at low opacity to give the colour a bloom. */
  glow?: boolean;
  className?: string;
}

/** How fast the ring catches up. Roughly a 220ms settle at 60fps. */
const EASE = 0.18;

export function AllocationRing({
  allocations,
  thicknessPct = 13,
  badgeRadiusPct = 0,
  renderBadge,
  glow = true,
  className = "",
}: AllocationRingProps) {
  const ring = useRef<HTMLDivElement | null>(null);
  const bloom = useRef<HTMLDivElement | null>(null);
  const badges = useRef<(HTMLDivElement | null)[]>([]);
  const displayed = useRef<number[]>([]);
  const frame = useRef<number | null>(null);
  const reduced = usePrefersReducedMotion();

  const target = allocations.map((a) => a.weightBps);
  const colors = allocations.map((a) => stackAccent(a.slot, a.kind));
  const key = allocations.map((a) => a.assetId).join(",");

  useEffect(() => {
    // The asset list changed. Anything newly arrived starts from nothing and grows into
    // place; anything already here keeps the width it is currently painted at, so adding
    // a fourth stock does not restart the other three from their old values.
    const prev = displayed.current;
    displayed.current = target.map((w, i) => (i < prev.length ? prev[i]! : 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    const paint = (weights: number[]) => {
      const segs = segments(weights);
      const paintValue = ringBackground(segs, colors);
      if (ring.current) ring.current.style.background = paintValue;
      if (bloom.current) bloom.current.style.background = paintValue;

      if (badgeRadiusPct > 0) {
        const points = badgePoints(segs, { radiusPct: badgeRadiusPct });
        points.forEach((p, i) => {
          const node = badges.current[i];
          if (!node) return;
          node.style.left = `${p.leftPct}%`;
          node.style.top = `${p.topPct}%`;
        });
      }
    };

    // Reduced motion, or nothing to show: write the truth once and stop. No loop is
    // started at all, so there is no rAF running behind a page that asked for stillness.
    if (reduced || target.length === 0) {
      displayed.current = [...target];
      paint(target);
      return;
    }

    const step = () => {
      const now = displayed.current;
      let moving = false;

      for (let i = 0; i < target.length; i++) {
        const to = target[i]!;
        const from = now[i] ?? 0;
        const delta = to - from;
        // Snap inside half a basis point rather than easing forever toward it: the ring
        // would otherwise keep a frame loop alive to move a hundredth of a degree.
        if (Math.abs(delta) < 0.5) {
          now[i] = to;
        } else {
          now[i] = from + delta * EASE;
          moving = true;
        }
      }
      now.length = target.length;

      paint(now);
      frame.current = moving ? requestAnimationFrame(step) : null;
    };

    // Kick the loop, cancelling any frame still queued from the previous target so two
    // tweens never chase the same element.
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(step);

    // A backgrounded tab throttles rAF to something like a frame a second, which leaves
    // the ring visibly part-way through a tween when you come back. Jumping to the truth
    // on hide means it is correct the moment the tab is visible again.
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      displayed.current = [...target];
      paint(target);
    };
    document.addEventListener("visibilitychange", onHide);

    return () => {
      document.removeEventListener("visibilitychange", onHide);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.join(","), colors.join(","), badgeRadiusPct, reduced]);

  // The donut is cut with a mask rather than drawn as a border, so the gaps between
  // segments show the chamber through them instead of a ring-coloured seam.
  const donut = {
    WebkitMaskImage: `radial-gradient(farthest-side, transparent calc(100% - ${thicknessPct}%), #000 calc(100% - ${thicknessPct}% + 1px))`,
    maskImage: `radial-gradient(farthest-side, transparent calc(100% - ${thicknessPct}%), #000 calc(100% - ${thicknessPct}% + 1px))`,
  } as const;

  const empty = allocations.length === 0;

  // The whole ring is decorative wherever it appears: in the chamber the allocation
  // controls say the same thing in words, and on the preview card the legend beside it
  // does. Hiding it here rather than at each call site means no caller can forget.
  return (
    <div aria-hidden className={`absolute inset-0 ${className}`}>
      {/* The bloom: the same ring, blurred, underneath. Its own element and deliberately
          childless — blurring anything that contains text is how type turns to soup. */}
      {glow && !empty ? (
        <div
          ref={bloom}
          aria-hidden
          className="absolute inset-0 rounded-full opacity-50 blur-2xl"
          style={donut}
        />
      ) : null}

      {/* The empty ring is a real ring, not an absence. A dashed circle reads as a slot
          waiting to be filled; a blank square reads as a page that failed to load. */}
      {empty ? (
        <div
          aria-hidden
          className="absolute inset-0 rounded-full border-2 border-dashed border-line-strong opacity-50"
        />
      ) : (
        <div ref={ring} aria-hidden className="absolute inset-0 rounded-full" style={donut} />
      )}

      {badgeRadiusPct > 0 && renderBadge
        ? allocations.map((allocation, i) => (
            <div
              key={allocation.assetId}
              ref={(node) => {
                badges.current[i] = node;
              }}
              className="stack-badge absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: "50%", top: "50%" }}
            >
              {renderBadge(allocation, i)}
            </div>
          ))
        : null}
    </div>
  );
}

/** The weights as a percentage string, for the one place that wants it inline. */
export function ringTitle(allocations: readonly Allocation[]): string {
  if (allocations.length === 0) return "An empty Stack";
  return allocations
    .map((a) => `${a.assetId} ${Math.round((a.weightBps / TOTAL_BPS) * 1000) / 10}%`)
    .join(", ");
}
