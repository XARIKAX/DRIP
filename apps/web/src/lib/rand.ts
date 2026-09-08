/**
 * The one pseudo-random source in the product.
 *
 * Seeded and deterministic, because two very different things depend on it: the demo
 * store, which needs a portfolio that looks the same every reload, and the garden,
 * which is generated on the server and again in the browser and must produce byte
 * identical output both times or React tears the tree down as a hydration mismatch.
 *
 * mulberry32 is safe for that second use in a way most generators are not: it is
 * `Math.imul`, exclusive or, shifts, and one division by 2^32 — every operation exactly
 * specified by IEEE 754, so every engine agrees on every bit. Nothing here may ever
 * reach for `Math.sin`, `Math.pow` or friends, whose last-place accuracy is
 * deliberately left to the implementation.
 */

/** A seeded 32-bit generator. Same seed, same sequence, on every engine, forever. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An integer in [lo, hi], inclusive. */
export function randInt(rnd: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rnd() * (hi - lo + 1));
}

/** True with the given probability. */
export function chance(rnd: () => number, p: number): boolean {
  return rnd() < p;
}

/** One of the entries, uniformly. */
export function pick<T>(rnd: () => number, items: readonly T[]): T {
  return items[Math.floor(rnd() * items.length)]!;
}
