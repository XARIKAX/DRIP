/**
 * Where the ring's arcs and badges go.
 *
 * Three surfaces draw the same donut — the chamber's conic gradient, the preview card's
 * miniature, and the 1600x1000 PNG the export paints with canvas — and they must agree
 * exactly, because the card is a photograph of the thing the user just built. So the
 * angles are computed once, here, in one convention, and the three renderers only differ
 * in how they paint what this returns.
 *
 * The convention: degrees, clockwise, zero at twelve o'clock. That is what
 * `conic-gradient()` does with no `from` at all — the spec starts it at the top and runs
 * it clockwise — so the CSS needs no correction and neither do the badges. Canvas is the
 * odd one out (`ctx.arc` measures from three o'clock), and that single `-90` lives in
 * the export and nowhere else.
 *
 * Pure: no DOM, no React, no CSS. Everything is a number or a string, and the tests can
 * assert on all of it.
 */

import { TOTAL_BPS } from "./allocation.ts";

export interface Segment {
  /** Where this asset's share begins, before the gap is trimmed. */
  startDeg: number;
  /** Where it ends, before the gap is trimmed. `endDeg - startDeg` IS the weight. */
  endDeg: number;
  /** The painted arc, gap already taken off this end. */
  drawStartDeg: number;
  drawEndDeg: number;
  /** The midpoint of the true span. Where the badge sits. */
  midDeg: number;
}

/** The decorative separation between segments, in degrees. */
export const GAP_DEG = 3;

/**
 * Turn weights into arcs.
 *
 * The rule that matters: **a segment's angular span always equals its weight.** The gap
 * is trimmed off the ends of the painted arc, never taken out of the share. Subtracting
 * the gap from the weight instead is the obvious shortcut and it is wrong — it makes a
 * 50% asset occupy less than half the ring, so the picture quietly disagrees with the
 * number printed next to it, and the disagreement grows with the number of assets.
 *
 * Two edge cases the naive version gets wrong:
 *
 * - **A tiny weight.** A 0.1% asset spans 0.36 degrees. Trimming 1.5 degrees off each
 *   end leaves an arc that ends before it starts, and the renderer draws either nothing
 *   or a segment running the wrong way round the ring. So the trim is capped at 55% of
 *   the span: the arc keeps at least 45% of its own width, always in the right
 *   direction, and a small holding stays visible as a sliver instead of vanishing.
 * - **One asset.** A single holding is a complete ring, so the gap goes to zero. With a
 *   gap it would draw a notch at twelve o'clock, and a notch reads as a second segment
 *   that is not there — a fake split in a portfolio that has nothing to split.
 */
export function segments(weightsBps: readonly number[], gapDeg = GAP_DEG): Segment[] {
  const n = weightsBps.length;
  if (n === 0) return [];

  const gap = n === 1 ? 0 : gapDeg;
  const out: Segment[] = [];
  let cursor = 0;

  for (const bps of weightsBps) {
    const span = (360 * bps) / TOTAL_BPS;
    const start = cursor;
    const end = cursor + span;

    // Half a gap off each end, but never so much that the ends cross.
    const trim = Math.min(gap, span * 0.55) / 2;

    out.push({
      startDeg: start,
      endDeg: end,
      drawStartDeg: start + trim,
      drawEndDeg: end - trim,
      midDeg: start + span / 2,
    });
    cursor = end;
  }

  return out;
}

/**
 * The `conic-gradient()` colour stops for a set of segments.
 *
 * Stops come in hard pairs — the same colour at both ends of the arc, transparent at
 * both ends of the gap — so every edge is a step rather than a ramp. A gradient with one
 * stop per boundary blends each colour into the next across the whole segment, which on
 * a three-asset ring looks less like an allocation and more like a mood.
 */
export function conicStops(segs: readonly Segment[], colors: readonly string[]): string {
  if (segs.length === 0) return "transparent 0deg, transparent 360deg";

  const parts: string[] = [];
  let cursor = 0;

  segs.forEach((s, i) => {
    const color = colors[i] ?? "currentColor";
    if (s.drawStartDeg > cursor) {
      parts.push(`transparent ${round(cursor)}deg`, `transparent ${round(s.drawStartDeg)}deg`);
    }
    parts.push(`${color} ${round(s.drawStartDeg)}deg`, `${color} ${round(s.drawEndDeg)}deg`);
    cursor = s.drawEndDeg;
  });

  if (cursor < 360) parts.push(`transparent ${round(cursor)}deg`, `transparent 360deg`);
  return parts.join(", ");
}

/** The whole `conic-gradient(...)` value, ready to assign to `background`. */
export function conicGradient(segs: readonly Segment[], colors: readonly string[]): string {
  return `conic-gradient(${conicStops(segs, colors)})`;
}

/**
 * What to paint on the ring element: usually a gradient, sometimes a flat colour.
 *
 * A single holding is the exception, and it is worth the branch. Its stops are the same
 * colour at 0deg and at 360deg, which *should* be a solid disc — but a conic gradient
 * still has a start angle, and several engines rasterise a one-pixel seam along it. On a
 * Stack holding one stock that hairline reads as a division in something undivided,
 * which is precisely the fake split the geometry above works to avoid. A flat background
 * has no start angle and so cannot seam.
 */
export function ringBackground(segs: readonly Segment[], colors: readonly string[]): string {
  if (segs.length === 1) return colors[0] ?? "currentColor";
  return conicGradient(segs, colors);
}

/* ------------------------------------------------------------------ */
/* Badges                                                              */
/* ------------------------------------------------------------------ */

export interface BadgePoint {
  /** Percent of the square wrapper's width. Feed straight to `left`. */
  leftPct: number;
  /** Percent of its height. Feed straight to `top`. */
  topPct: number;
  /** The angle used, for anything that wants to check its own work. */
  deg: number;
  /** True when this badge was pushed to the inner track to dodge its neighbour. */
  inset: boolean;
}

/**
 * Where each badge sits, as percentages of the square that holds the ring.
 *
 * Percentages rather than pixels on purpose: the chamber is sized with `clamp()` and
 * changes width at every breakpoint, and percentages of a square are the same in both
 * axes. So the badges track the ring through every resize with no ResizeObserver, no
 * layout read, and nothing to get out of step during a transition.
 *
 * `sin`/`-cos` rather than the usual `cos`/`sin` because this convention starts at
 * twelve o'clock and runs clockwise, and because CSS `top` grows downward. Check it at
 * the corners: 0 degrees gives (50, 50 - r) which is the top, 90 gives (50 + r, 50)
 * which is the right. Both correct.
 *
 * ### Collisions
 *
 * Two adjacent small segments put their badges on top of each other, and a badge that
 * overlaps its neighbour's label is worse than no badge. A badge of diameter `d` at
 * radius `r` needs `2 * asin(d / 2r)` degrees of clearance. Where a neighbour is closer
 * than that, alternate badges step onto an inner track.
 *
 * Alternating by *position within the crowded run* rather than by global index matters:
 * it guarantees no two adjacent badges share a track, which parity on the global index
 * does not once a run begins at an odd position. And the badge never moves along the
 * ring, only inward — a label that slid sideways would end up sitting over a different
 * asset's arc, pointing at the wrong thing entirely.
 */
export function badgePoints(
  segs: readonly Segment[],
  options: { radiusPct?: number; badgePct?: number; insetFactor?: number } = {}
): BadgePoint[] {
  const radius = options.radiusPct ?? 39;
  const badge = options.badgePct ?? 13;
  const insetFactor = options.insetFactor ?? 0.76;

  // Clearance one badge needs, in degrees, at the outer track.
  const needed = 2 * toDeg(Math.asin(Math.min(badge / (2 * radius), 1)));

  // Walk the ring marking which badges are crowded by the one before them.
  const crowded = segs.map((s, i) => {
    if (segs.length < 2) return false;
    const prev = segs[(i - 1 + segs.length) % segs.length]!;
    return angularGap(prev.midDeg, s.midDeg) < needed;
  });

  let runPosition = 0;
  return segs.map((s, i) => {
    if (crowded[i]) runPosition += 1;
    else runPosition = 0;

    const inset = runPosition % 2 === 1;
    const r = inset ? radius * insetFactor : radius;
    const rad = toRad(s.midDeg);

    return {
      leftPct: 50 + r * Math.sin(rad),
      topPct: 50 - r * Math.cos(rad),
      deg: s.midDeg,
      inset,
    };
  });
}

/**
 * Whether the badges should carry their weight pills at this size.
 *
 * Below roughly this width the pill's text is either illegible or wider than the arc it
 * belongs to, and the legend under the ring is already saying the same numbers with room
 * to breathe. Printing them twice, badly, is not more information.
 */
export function showBadgeWeights(ringPx: number, count: number): boolean {
  if (count <= 3) return ringPx >= 260;
  return ringPx >= 340;
}

/* ------------------------------------------------------------------ */
/* Small maths                                                         */
/* ------------------------------------------------------------------ */

/** Shortest distance between two angles on the circle, 0..180. */
export function angularGap(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360 + 360) % 360);
  return d > 180 ? 360 - d : d;
}

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Three decimals is past the point any screen can tell, and keeps the CSS string short. */
function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
