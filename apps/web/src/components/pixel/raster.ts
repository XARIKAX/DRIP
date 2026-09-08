/**
 * The raster.
 *
 * A sprite is rows of single-character palette keys. This turns one into the smallest
 * set of rectangles that draws it — runs merged along x, then merged again along y —
 * which is what makes inline SVG the right container for pixel art rather than a canvas.
 *
 * SVG wins here on every axis that matters: it renders on the server, so a tree is in
 * the HTML rather than appearing after hydration; it takes CSS custom properties as
 * fills, so one sprite is drawn once and lit twice, at noon and at dusk; and it costs
 * nothing per frame, because it never animates itself. A 48x64 tree that would be 3,072
 * rectangles one-per-pixel comes out around 300 after merging.
 *
 * The one rule that is not negotiable: sprites are placed at whole multiples of the
 * `--cell` unit. Pixel art scales in integers or it stops being pixel art.
 */

/** Rows of palette keys. `.` is always transparent. */
export type Grid = readonly string[];

/** Palette keys to CSS colours — usually `var(--pk-*)`, so the sprite re-tints by context. */
export type Palette = Readonly<Record<string, string>>;

export interface Run {
  x: number;
  y: number;
  w: number;
  h: number;
  k: string;
}

export const TRANSPARENT = ".";

/**
 * Width and height, and a guard against a ragged sprite.
 *
 * A row one character short shifts everything after it and produces art that looks
 * subtly wrong in a way that is very hard to see and very easy to ship, so it throws
 * instead. Sprites are module-scope constants, which means this runs at import time and
 * a bad one cannot reach a page.
 */
export function gridSize(grid: Grid): { w: number; h: number } {
  const w = grid[0]?.length ?? 0;
  for (let y = 0; y < grid.length; y++) {
    if (grid[y]!.length !== w) {
      throw new Error(`pixel: ragged sprite — row ${y} is ${grid[y]!.length} wide, expected ${w}`);
    }
  }
  return { w, h: grid.length };
}

/**
 * Most garden objects are symmetric, so they are authored as a left half plus the
 * centre column and mirrored here. Half the drawing, and the symmetry becomes
 * structural rather than something to proofread.
 */
export function mirror(half: Grid): Grid {
  return half.map((row) => row + [...row].slice(0, -1).reverse().join(""));
}

/**
 * Crop a grid to the cells that actually carry something.
 *
 * The generators draw into a working canvas larger than the art they intend, because a
 * tree does not know how wide it will be until it has grown. Without this the canvas
 * edge becomes a guillotine: a branch that reaches past row zero is not shortened, it
 * is cut flat, and a canopy sliced square along the top is the most obvious tell that
 * something is generated rather than drawn.
 */
export function trim(grid: Grid): Grid {
  const { w, h } = gridSize(grid);
  let top = h;
  let bottom = -1;
  let left = w;
  let right = -1;

  for (let y = 0; y < h; y++) {
    const row = grid[y]!;
    for (let x = 0; x < w; x++) {
      if (row[x] === TRANSPARENT) continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }

  if (bottom < 0) return grid;
  return grid.slice(top, bottom + 1).map((row) => row.slice(left, right + 1));
}

/** Flip horizontally — for a koi that swims the other way. */
export function flipX(grid: Grid): Grid {
  return grid.map((row) => [...row].reverse().join(""));
}

/** Lay one sprite over another at an offset, ignoring its transparent cells. */
export function overlay(base: string[], sprite: Grid, ox: number, oy: number): void {
  const { w, h } = gridSize(sprite);
  for (let y = 0; y < h; y++) {
    const ty = oy + y;
    if (ty < 0 || ty >= base.length) continue;
    const row = base[ty]!;
    const chars = [...row];
    for (let x = 0; x < w; x++) {
      const k = sprite[y]![x]!;
      if (k === TRANSPARENT) continue;
      const tx = ox + x;
      if (tx < 0 || tx >= chars.length) continue;
      chars[tx] = k;
    }
    base[ty] = chars.join("");
  }
}

/** A blank canvas of transparent cells, ready to be drawn into. */
export function blank(w: number, h: number): string[] {
  return Array.from({ length: h }, () => TRANSPARENT.repeat(w));
}

/** Set one cell, ignoring anything outside the canvas. */
export function put(g: string[], x: number, y: number, k: string): void {
  if (y < 0 || y >= g.length) return;
  const row = g[y]!;
  if (x < 0 || x >= row.length) return;
  g[y] = row.slice(0, x) + k + row.slice(x + 1);
}

export function get(g: Grid, x: number, y: number): string {
  if (y < 0 || y >= g.length) return TRANSPARENT;
  const row = g[y]!;
  if (x < 0 || x >= row.length) return TRANSPARENT;
  return row[x]!;
}

/**
 * Bresenham, in integers only.
 *
 * Deliberately not `Math.round(x0 + t * dx)`: every branch in the garden is drawn with
 * this, on the server and again in the browser, and integer arithmetic is the only kind
 * two engines are guaranteed to agree about down to the last bit.
 */
export function line(g: string[], x0: number, y0: number, x1: number, y1: number, k: string, weight = 1): void {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;

  for (;;) {
    for (let i = 0; i < weight; i++) put(g, x + i, y, k);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

/**
 * Runs, merged twice.
 *
 * First along x, which is the obvious win. Then along y, which is the one that matters
 * for a tree: a trunk is a tall column of identical one-wide runs, and collapsing those
 * into single rectangles is the difference between a few hundred nodes and a few
 * thousand. Results are cached, because sprites are constants and a page may draw the
 * same one a dozen times.
 */
const cache = new WeakMap<object, Run[]>();

export function toRuns(grid: Grid): Run[] {
  const cached = cache.get(grid as object);
  if (cached) return cached;

  const { w, h } = gridSize(grid);
  const out: Run[] = [];
  // Runs still growing downward, keyed by "x:w:k".
  let open = new Map<string, Run>();

  for (let y = 0; y < h; y++) {
    const row = grid[y]!;
    const next = new Map<string, Run>();

    let x = 0;
    while (x < w) {
      const k = row[x]!;
      if (k === TRANSPARENT) {
        x++;
        continue;
      }
      let end = x;
      while (end + 1 < w && row[end + 1] === k) end++;
      const width = end - x + 1;
      const key = `${x}:${width}:${k}`;
      const prev = open.get(key);
      if (prev && prev.y + prev.h === y) {
        prev.h++;
        next.set(key, prev);
      } else {
        const run: Run = { x, y, w: width, h: 1, k };
        out.push(run);
        next.set(key, run);
      }
      x = end + 1;
    }
    open = next;
  }

  cache.set(grid as object, out);
  return out;
}
