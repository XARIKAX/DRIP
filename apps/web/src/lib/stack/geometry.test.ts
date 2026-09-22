/**
 * The ring's geometry.
 *
 * The claim under test is the one the picture makes: an asset's arc is the size of its
 * number. Everything else here guards an edge case that has a specific ugly failure —
 * a sliver that inverts, a lone asset drawn with a fake seam, a badge parked over its
 * neighbour's label.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  angularGap,
  badgePoints,
  conicGradient,
  conicStops,
  GAP_DEG,
  ringBackground,
  segments,
  showBadgeWeights,
} from "./geometry.ts";

const span = (s: { startDeg: number; endDeg: number }) => s.endDeg - s.startDeg;
const drawn = (s: { drawStartDeg: number; drawEndDeg: number }) => s.drawEndDeg - s.drawStartDeg;

/* ------------------------------------------------------------------ */
/* Spans are the weights                                               */
/* ------------------------------------------------------------------ */

test("a 50% asset occupies half the ring", () => {
  const [nvda] = segments([5000, 3000, 2000]);
  assert.equal(span(nvda!), 180);
});

test("every span equals its weight, gap or no gap", () => {
  const segs = segments([5000, 3000, 2000]);
  assert.deepEqual(segs.map(span), [180, 108, 72]);
  assert.equal(segs.reduce((s, x) => s + span(x), 0), 360);
});

test("segments run end to end with no drift", () => {
  const segs = segments([3333, 3333, 3334]);
  assert.equal(segs[0]!.startDeg, 0);
  assert.equal(segs[0]!.endDeg, segs[1]!.startDeg);
  assert.equal(segs[1]!.endDeg, segs[2]!.startDeg);
  assert.ok(Math.abs(segs[2]!.endDeg - 360) < 1e-9);
});

test("the gap is taken off the drawn arc, not out of the share", () => {
  const [a] = segments([5000, 5000]);
  assert.equal(span(a!), 180, "the share is untouched");
  assert.equal(drawn(a!), 180 - GAP_DEG, "the paint is inset by one whole gap");
});

/* ------------------------------------------------------------------ */
/* The edges that break a naive version                               */
/* ------------------------------------------------------------------ */

test("one asset is an unbroken ring with no fake seam", () => {
  const [only] = segments([10_000]);
  assert.equal(only!.drawStartDeg, 0);
  assert.equal(only!.drawEndDeg, 360);
  assert.equal(drawn(only!), 360);
});

test("a sliver still draws, and draws forwards", () => {
  // 0.01% is 0.036 degrees — far narrower than the 3 degree gap.
  const segs = segments([1, 9999]);
  for (const s of segs) {
    assert.ok(drawn(s) > 0, `inverted: ${JSON.stringify(s)}`);
    assert.ok(s.drawEndDeg > s.drawStartDeg);
  }
  assert.ok(drawn(segs[0]!) >= span(segs[0]!) * 0.45, "keeps at least 45% of its span");
});

test("no drawn arc ever escapes its own share", () => {
  for (const weights of [[1, 9999], [5000, 4999, 1], [2000, 2000, 2000, 2000, 2000], [10_000]]) {
    for (const s of segments(weights)) {
      assert.ok(s.drawStartDeg >= s.startDeg - 1e-9, "starts inside");
      assert.ok(s.drawEndDeg <= s.endDeg + 1e-9, "ends inside");
    }
  }
});

test("drawn arcs never overlap each other", () => {
  const segs = segments([1, 1, 9998]);
  for (let i = 1; i < segs.length; i++) {
    assert.ok(segs[i]!.drawStartDeg >= segs[i - 1]!.drawEndDeg, `arc ${i} overlaps ${i - 1}`);
  }
});

test("an empty Stack has no segments", () => {
  assert.deepEqual(segments([]), []);
});

/* ------------------------------------------------------------------ */
/* Gradient stops                                                      */
/* ------------------------------------------------------------------ */

test("stops are hard pairs, so edges are steps rather than ramps", () => {
  const stops = conicStops(segments([5000, 5000]), ["#78EC51", "#FF6574"]);
  assert.equal((stops.match(/#78EC51/g) ?? []).length, 2, "colour appears at both ends");
  assert.equal((stops.match(/#FF6574/g) ?? []).length, 2);
});

test("the gradient closes the circle", () => {
  const stops = conicStops(segments([5000, 3000, 2000]), ["a", "b", "c"]);
  assert.ok(stops.endsWith("transparent 360deg"), stops);
});

test("a single asset needs no transparent run at all", () => {
  const stops = conicStops(segments([10_000]), ["#78EC51"]);
  assert.ok(!stops.includes("transparent"), stops);
});

test("an empty ring is transparent rather than undefined", () => {
  assert.equal(conicStops([], []), "transparent 0deg, transparent 360deg");
  assert.ok(conicGradient([], []).startsWith("conic-gradient("));
});

test("a missing colour falls back instead of writing undefined into CSS", () => {
  const stops = conicStops(segments([5000, 5000]), ["#78EC51"]);
  assert.ok(!stops.includes("undefined"), stops);
});

/* ------------------------------------------------------------------ */
/* Badges                                                              */
/* ------------------------------------------------------------------ */

test("a badge sits at the midpoint of its own arc", () => {
  const segs = segments([5000, 3000, 2000]);
  const points = badgePoints(segs);
  points.forEach((p, i) => {
    assert.ok(p.deg > segs[i]!.startDeg && p.deg < segs[i]!.endDeg, `badge ${i} left its arc`);
  });
});

test("twelve o'clock is up and three o'clock is right", () => {
  // One asset: its midpoint is 180 degrees, which is the bottom.
  const [bottom] = badgePoints(segments([10_000]));
  assert.ok(Math.abs(bottom!.leftPct - 50) < 1e-6);
  assert.ok(bottom!.topPct > 50, "180 degrees must be below centre");

  // Two equal assets: midpoints at 90 and 270 — right, then left.
  const [right, left] = badgePoints(segments([5000, 5000]));
  assert.ok(right!.leftPct > 50, "90 degrees must be right of centre");
  assert.ok(left!.leftPct < 50, "270 degrees must be left of centre");
  assert.ok(Math.abs(right!.topPct - 50) < 1e-6);
});

test("badges stay inside the square that holds them", () => {
  for (const p of badgePoints(segments([2000, 2000, 2000, 2000, 2000]))) {
    assert.ok(p.leftPct >= 0 && p.leftPct <= 100, `leftPct ${p.leftPct}`);
    assert.ok(p.topPct >= 0 && p.topPct <= 100, `topPct ${p.topPct}`);
  }
});

test("crowded badges step onto the inner track, and never two in a row", () => {
  // Three slivers bunched together at the top of the ring.
  const points = badgePoints(segments([40, 40, 40, 9880]));
  const crowded = points.slice(0, 3);
  assert.ok(crowded.some((p) => p.inset), "nothing moved out of the way");
  for (let i = 1; i < crowded.length; i++) {
    assert.ok(
      crowded[i]!.inset !== crowded[i - 1]!.inset,
      `badges ${i - 1} and ${i} are both on the ${crowded[i]!.inset ? "inner" : "outer"} track`
    );
  }
});

test("a comfortable ring leaves every badge on the outer track", () => {
  assert.ok(badgePoints(segments([3333, 3333, 3334])).every((p) => !p.inset));
});

test("weight pills drop off the badges when the ring gets small", () => {
  assert.ok(showBadgeWeights(420, 3));
  assert.ok(!showBadgeWeights(200, 3));
  assert.ok(!showBadgeWeights(300, 5), "five badges need more room than three");
  assert.ok(showBadgeWeights(360, 5));
});

/* ------------------------------------------------------------------ */
/* Small maths                                                         */
/* ------------------------------------------------------------------ */

test("angularGap takes the short way round", () => {
  assert.equal(angularGap(10, 350), 20);
  assert.equal(angularGap(350, 10), 20);
  assert.equal(angularGap(0, 180), 180);
  assert.equal(angularGap(90, 90), 0);
});

test("a single holding is painted flat, so no engine can seam it", () => {
  const bg = ringBackground(segments([10_000]), ["#78EC51"]);
  assert.equal(bg, "#78EC51");
  assert.ok(!bg.includes("conic-gradient"));
});

test("two or more holdings are painted as a gradient", () => {
  const bg = ringBackground(segments([5000, 5000]), ["#78EC51", "#FF6574"]);
  assert.ok(bg.startsWith("conic-gradient("), bg);
});
