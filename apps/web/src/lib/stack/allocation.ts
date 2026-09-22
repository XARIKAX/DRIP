/**
 * The Stack's allocation arithmetic.
 *
 * One canonical state, held in basis points. The ring, the sliders, the percentage
 * fields, the preview card, the review and the exported PNG all derive from this array;
 * nothing anywhere keeps a second copy of a percentage. That is the whole reason this
 * module is pure — no React, no DOM, no clock — because the moment two components each
 * hold "50" the two of them start disagreeing and a portfolio adds up to 101%.
 *
 * Weights are integers summing to exactly 10 000, never floats summing to "about 1.0".
 * A float total is a rounding argument waiting to happen: 0.1 + 0.2 is famously not 0.3,
 * and the number this feature is loudest about is the one that says 100% ALLOCATED. An
 * integer total is either right or it is a bug, and the tests can say which.
 *
 * Every function here is total. They take an array and return a new one; none throws,
 * none mutates, and an operation that cannot be honoured (a sixth asset, a duplicate)
 * returns the input unchanged rather than half-applying itself. Callers are free to be
 * careless; the state cannot be corrupted from outside this file.
 */

/** A whole allocation, in basis points. 10 000 bp = 100%. */
export const TOTAL_BPS = 10_000;

/**
 * The floor an asset in the Stack may hold: 0.01%.
 *
 * Not zero, deliberately. A zero-weight asset is one that is in the list, draws a
 * legend row and a badge, and occupies none of the ring — which looks like the ring
 * lost it. Removing an asset is an explicit act with its own control, so "in the Stack"
 * always means "visible in the Stack".
 */
export const MIN_BPS = 1;

/** V1 holds five. Past that the ring's badges collide and the idea stops being legible. */
export const MAX_ASSETS = 5;

/** How many distinct accents the ring paints with. One per slot, so five. */
export const SLOT_COUNT = 5;

export interface Allocation {
  /** Ticker, matching `TokenInfo.symbol` from the data seam. */
  assetId: string;
  /** Integer, MIN_BPS..TOTAL_BPS. The array always sums to exactly TOTAL_BPS. */
  weightBps: number;
  /**
   * Which of the five ring accents paints this asset, 0..4.
   *
   * Carried on the allocation rather than derived from the array index, because an
   * index-derived colour repaints every asset below the one you just removed. Nothing
   * about the Stack changed, but three segments change colour at once, and it reads as
   * a glitch. A slot is held until its asset leaves and is then returned to the pool,
   * so colours only ever change when the thing they identify does.
   */
  slot: number;
}

/* ------------------------------------------------------------------ */
/* Rounding                                                            */
/* ------------------------------------------------------------------ */

/**
 * Hand out `total` basis points in the proportions of `shares`, losing nothing.
 *
 * The largest-remainder method: floor every exact target, then give the basis points
 * the flooring dropped to whoever was robbed most, one at a time. The alternative —
 * rounding each weight independently — reliably produces 9 999 or 10 001, and then
 * something downstream has to "fix" a total the user can see, which is how a slider
 * ends up twitching by 0.01% when you let go of it.
 *
 * Ties go to the earlier asset. Arbitrary, but *stable*: the same input gives the same
 * output on every machine and every render, which is what makes the result testable and
 * keeps a draft restoring to the numbers it was saved with.
 *
 * Every entry is guaranteed `MIN_BPS` before any of this, so an asset rounded to nothing
 * still holds its floor. `total` must therefore be at least `shares.length * MIN_BPS`;
 * callers get that right by construction and the clamp below enforces it anyway.
 */
function apportion(shares: number[], total: number): number[] {
  const n = shares.length;
  if (n === 0) return [];

  const floor = MIN_BPS * n;
  const pool = Math.max(total - floor, 0);
  const sum = shares.reduce((a, b) => a + Math.max(b, 0), 0);

  // Nothing to go on — a zeroed or empty basis. Spread the pool evenly rather than
  // dividing by zero; this is reachable when every survivor of a removal held the floor.
  const exact =
    sum > 0
      ? shares.map((s) => (Math.max(s, 0) / sum) * pool)
      : shares.map(() => pool / n);

  const out = exact.map((v) => Math.floor(v));
  let residual = pool - out.reduce((a, b) => a + b, 0);

  // Index order breaks ties, so the sort is deterministic on equal remainders.
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  for (let k = 0; residual > 0; k++, residual--) {
    out[order[k % n]!.i] += 1;
  }

  return out.map((v) => v + MIN_BPS);
}

/* ------------------------------------------------------------------ */
/* Operations                                                          */
/* ------------------------------------------------------------------ */

/** The lowest accent not currently spoken for. */
function freeSlot(allocations: Allocation[]): number {
  const taken = new Set(allocations.map((a) => a.slot));
  for (let s = 0; s < SLOT_COUNT; s++) if (!taken.has(s)) return s;
  return 0; // unreachable while MAX_ASSETS <= SLOT_COUNT, but never hand back undefined
}

/** Rebuild an array against a fresh set of weights, keeping order and slots. */
function withWeights(allocations: Allocation[], weights: number[]): Allocation[] {
  return allocations.map((a, i) => ({ ...a, weightBps: weights[i] ?? MIN_BPS }));
}

/**
 * Add an asset.
 *
 * The newcomer takes an even share of the whole — 1/n once it is counted — and the
 * assets already there scale proportionally into what is left. Proportionally, not
 * evenly: somebody who built 70/30 and adds a third asset means "and some of this too",
 * not "forget what I told you". Their ratio survives, which is the part they chose.
 *
 * A duplicate or a sixth asset is a no-op. The caller is told nothing; it already knows
 * what it asked for, and the UI refuses these at the control rather than here.
 */
export function addAsset(allocations: Allocation[], assetId: string): Allocation[] {
  if (allocations.length >= MAX_ASSETS) return allocations;
  if (allocations.some((a) => a.assetId === assetId)) return allocations;

  const next: Allocation = { assetId, weightBps: 0, slot: freeSlot(allocations) };
  if (allocations.length === 0) return [{ ...next, weightBps: TOTAL_BPS }];

  const n = allocations.length + 1;
  const share = Math.round(TOTAL_BPS / n);
  const rest = apportion(
    allocations.map((a) => a.weightBps),
    TOTAL_BPS - share
  );

  return [...withWeights(allocations, rest), { ...next, weightBps: share }];
}

/**
 * Remove an asset. What it held is shared out among the survivors in their own
 * proportions, so the shape of the idea is unchanged — only its cast.
 */
export function removeAsset(allocations: Allocation[], assetId: string): Allocation[] {
  const kept = allocations.filter((a) => a.assetId !== assetId);
  if (kept.length === allocations.length) return allocations;
  if (kept.length === 0) return [];

  return withWeights(
    kept,
    apportion(
      kept.map((a) => a.weightBps),
      TOTAL_BPS
    )
  );
}

/**
 * Set one asset's weight, and let the others absorb the difference.
 *
 * The edited weight is honoured exactly — it is the number the user typed or dragged to,
 * and watching it get "corrected" by a basis point is maddening. Everyone else scales
 * proportionally into the remainder. All the rounding loss therefore lands on the assets
 * the user is *not* currently looking at, which is the right place for it.
 *
 * The clamp leaves room for everybody else's floor, so a two-asset Stack tops out at
 * 99.99% rather than letting one asset take everything and silently evict the other.
 * A single asset is pinned at 100%: there is nothing for it to trade against, and the
 * control says so rather than offering a slider that cannot move.
 */
export function setWeight(
  allocations: Allocation[],
  assetId: string,
  weightBps: number
): Allocation[] {
  const index = allocations.findIndex((a) => a.assetId === assetId);
  if (index === -1) return allocations;
  if (allocations.length === 1) {
    return allocations[0]!.weightBps === TOTAL_BPS
      ? allocations
      : [{ ...allocations[0]!, weightBps: TOTAL_BPS }];
  }

  const target = clampWeight(weightBps, allocations.length);
  const rest = apportion(
    allocations.filter((_, i) => i !== index).map((a) => a.weightBps),
    TOTAL_BPS - target
  );

  let cursor = 0;
  return allocations.map((a, i) =>
    i === index ? { ...a, weightBps: target } : { ...a, weightBps: rest[cursor++] ?? MIN_BPS }
  );
}

/** The range one asset may hold in a Stack of `count`, leaving everyone else their floor. */
export function clampWeight(weightBps: number, count: number): number {
  if (count <= 1) return TOTAL_BPS;
  const max = TOTAL_BPS - (count - 1) * MIN_BPS;
  const v = Number.isFinite(weightBps) ? Math.round(weightBps) : MIN_BPS;
  return Math.min(Math.max(v, MIN_BPS), max);
}

/**
 * Repair an allocation array that came from outside — a restored draft, a shared link.
 *
 * Anything stored is eventually something hand-edited, truncated by a full disk, or
 * written by a version of this code that no longer exists. So nothing read back is
 * trusted: duplicates collapse, junk is dropped, over-long lists are cut to the cap,
 * slots are reassigned if they collide, and the weights are re-apportioned to sum to
 * exactly TOTAL_BPS whatever they claimed to sum to. The result is always valid or
 * empty, and the builder never boots into a state its own rules forbid.
 */
export function normalise(input: readonly Partial<Allocation>[]): Allocation[] {
  const seen = new Set<string>();
  const kept: { assetId: string; weightBps: number }[] = [];

  for (const raw of input) {
    const assetId = typeof raw?.assetId === "string" ? raw.assetId.trim().toUpperCase() : "";
    if (!assetId || seen.has(assetId)) continue;
    seen.add(assetId);

    const w = Number(raw?.weightBps);
    kept.push({ assetId, weightBps: Number.isFinite(w) && w > 0 ? w : MIN_BPS });
    if (kept.length === MAX_ASSETS) break;
  }

  if (kept.length === 0) return [];

  const weights = apportion(
    kept.map((a) => a.weightBps),
    TOTAL_BPS
  );
  return kept.map((a, i) => ({ assetId: a.assetId, weightBps: weights[i]!, slot: i }));
}

/* ------------------------------------------------------------------ */
/* Reading                                                             */
/* ------------------------------------------------------------------ */

/** True when the array is a legal Stack. The invariant every test asserts. */
export function isValid(allocations: readonly Allocation[]): boolean {
  if (allocations.length === 0) return true;
  if (allocations.length > MAX_ASSETS) return false;
  if (new Set(allocations.map((a) => a.assetId)).size !== allocations.length) return false;
  if (allocations.some((a) => !Number.isInteger(a.weightBps) || a.weightBps < MIN_BPS)) return false;
  return allocations.reduce((sum, a) => sum + a.weightBps, 0) === TOTAL_BPS;
}

/** Basis points as a percentage number: 2400 -> 24. */
export function toPct(weightBps: number): number {
  return weightBps / 100;
}

/**
 * A typed percentage back to basis points, or null when it is not a number yet.
 *
 * Null rather than zero, because a half-typed "1." is not a request for 0% — it is a
 * user mid-keystroke, and a field that rewrites what you are typing is unusable. The
 * caller holds the raw text until this answers.
 */
export function fromPctInput(text: string): number | null {
  const trimmed = text.trim().replace(/%$/, "");
  if (trimmed === "" || !/^\d*\.?\d*$/.test(trimmed)) return null;
  const pct = Number(trimmed);
  if (!Number.isFinite(pct)) return null;
  return Math.round(pct * 100);
}

/** Format for display: two decimals only when they say something. 2400 -> "24", 2450 -> "24.5". */
export function formatPct(weightBps: number): string {
  const pct = toPct(weightBps);
  return Number.isInteger(pct) ? String(pct) : String(Number(pct.toFixed(2)));
}
