import { chance, mulberry32, randInt } from "@/lib/rand";
import { blank, get, line, put, trim, type Grid } from "./raster";

/**
 * The grown half of the garden.
 *
 * These exist because the things they draw want variety. Five hand-drawn trees are one
 * tree stamped five times; five grown trees are a grove. Sand is not drawn at all — it
 * is an algorithm, and pretending otherwise would be a lie about the object.
 *
 * ------------------------------------------------------------------------------
 * TWO RULES, BOTH LOAD BEARING. Every function here runs twice: once on the server
 * and once in the browser. If the two disagree by a single cell, React tears the tree
 * down and the page flashes.
 *
 *   1. The seed is always an argument with a literal default. Never `Math.random()`,
 *      never `Date.now()`, never anything derived from a render.
 *   2. Integer and rational arithmetic only. No `Math.sin`, `Math.cos`, `Math.pow`,
 *      `Math.hypot`. The specification leaves the last place of a transcendental to the
 *      implementation, so V8 and JavaScriptCore are permitted to differ by one bit —
 *      and one bit either side of a `Math.floor` is a different pixel. Angles come from
 *      an integer direction table, circles from squared distances compared against
 *      squared radii, and arithmetic on the generator's own output is safe because
 *      IEEE 754 multiplication and division are exactly specified.
 * ------------------------------------------------------------------------------
 */

/**
 * Thirteen directions, ordered left to right, as integer vectors of length ~8.
 * Indexing this table is how a branch turns: `dir - 2` leans left, `dir + 2` leans
 * right, and no angle is ever computed.
 */
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [-7, -4],
  [-6, -5],
  [-5, -6],
  [-4, -7],
  [-3, -7],
  [-2, -8],
  [0, -8],
  [2, -8],
  [3, -7],
  [4, -7],
  [5, -6],
  [6, -5],
  [7, -4],
];
const UPRIGHT = 6;

/** A cheap integer hash, for ragged edges and dither. Same input, same bit, everywhere. */
function hash(x: number, y: number): number {
  return (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
}

/**
 * A blossom cluster.
 *
 * Four tones shaded away from a highlight set up and to the left, because every light
 * on this site comes from the same place. The rim is eaten away by the hash so the
 * cluster reads as a mass of flowers rather than a circle, which is the entire
 * difference between blossom and a dot.
 */
function bloom(g: string[], cx: number, cy: number, r: number): void {
  const r2 = r * r;
  const hx = -(r >> 1);
  const hy = -(r >> 1);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      // Ragged rim: drop about half the outermost ring.
      if (d2 > r2 - r && (hash(cx + dx, cy + dy) & 1) === 0) continue;
      const lx = dx - hx;
      const ly = dy - hy;
      const dd = lx * lx + ly * ly;
      let tone = dd * 10 <= r2 * 6 ? 0 : dd * 10 <= r2 * 16 ? 1 : dd * 10 <= r2 * 30 ? 2 : 3;
      // A one-tone dither on a third of the cells, so the shading steps read as
      // texture instead of as contour bands.
      if (tone > 0 && hash(cx + dx * 7, cy + dy * 5) % 3 === 0) tone--;
      put(g, cx + dx, cy + dy, "abcd"[tone]!);
    }
  }
}

interface Tip {
  x: number;
  y: number;
  depth: number;
}

function grow(
  g: string[],
  tips: Tip[],
  x: number,
  y: number,
  dir: number,
  len: number,
  depth: number,
  maxDepth: number,
  rnd: () => number
): void {
  const idx = dir < 0 ? 0 : dir >= DIRS.length ? DIRS.length - 1 : dir;
  const [vx, vy] = DIRS[idx]!;
  const nx = x + ((vx * len) >> 3);
  const ny = y + ((vy * len) >> 3);

  // The trunk is lit on one side and thick at the base; twigs are a single cell.
  const weight = depth === 0 ? 3 : depth === 1 ? 2 : 1;
  line(g, x, y, nx, ny, depth <= 1 ? "T" : "t", weight);
  if (depth <= 1) line(g, x + weight, y, nx + weight, ny, "t", 1);

  if (depth >= maxDepth || len <= 3) {
    tips.push({ x: nx, y: ny, depth });
    return;
  }

  const spread = randInt(rnd, 2, 3);
  const shrink = 5 + randInt(rnd, 0, 2); // 5/8 .. 7/8
  const nlen = Math.max(3, (len * shrink) >> 3);

  grow(g, tips, nx, ny, idx - spread, nlen, depth + 1, maxDepth, rnd);
  grow(g, tips, nx, ny, idx + spread, nlen, depth + 1, maxDepth, rnd);
  // A third limb some of the time, or every tree comes out a perfect fork.
  if (chance(rnd, 0.4)) {
    grow(g, tips, nx, ny, idx + (chance(rnd, 0.5) ? 1 : -1), Math.max(3, nlen >> 1), depth + 1, maxDepth, rnd);
  }
  // A low limb off the trunk, which is what makes an old tree look old.
  if (depth === 0 && chance(rnd, 0.8)) {
    const mx = x + ((vx * len) >> 4);
    const my = y + ((vy * len) >> 4);
    grow(g, tips, mx, my, idx + (chance(rnd, 0.5) ? -4 : 4), (len * 5) >> 3, depth + 2, maxDepth, rnd);
  }
}

export interface SakuraOptions {
  seed?: number;
  w?: number;
  h?: number;
  /** Cluster radius at the tips. Bigger reads as fuller, and past 6 as a cloud. */
  bloom?: number;
  /** Whole cells the trunk leans off centre. */
  lean?: number;
  /** How many times a branch may divide. Four is a sapling, six is a canopy. */
  depth?: number;
  /** Draw the moss line under the trunk. */
  ground?: boolean;
}

/**
 * A blossoming tree. Same seed, same tree, on every machine and in every render.
 *
 * `w` and `h` describe the trunk's room to grow, not the sprite that comes out. The
 * canvas is padded generously and the result cropped to what actually grew, because a
 * tree that is cut off by its own canvas edge reads as damaged — a canopy sliced flat
 * along the top, blossoms shorn down one side. That is a property of the generator, not
 * of wherever the sprite is later placed, which is why it showed up in every section at
 * once.
 */
export function sakuraGrid(opts: SakuraOptions = {}): Grid {
  const w = opts.w ?? 56;
  const h = opts.h ?? 64;
  const seed = opts.seed ?? 1;
  const bloomR = opts.bloom ?? 5;
  const maxDepth = opts.depth ?? 5;
  const rnd = mulberry32(seed);

  // Room for the widest blossom on the longest branch, plus slack. Cropped back off.
  const pad = bloomR + 14;
  const gw = w + pad * 2;
  const gh = h + pad;
  const g = blank(gw, gh);
  const groundY = opts.ground === false ? gh : gh - 1;
  const cx = (gw >> 1) + (opts.lean ?? 0);
  const baseY = groundY - 1;

  const tips: Tip[] = [];
  grow(g, tips, cx, baseY, UPRIGHT + randInt(rnd, -1, 1), Math.max(8, (h * 5) >> 4), 0, maxDepth, rnd);

  // Blossom every tip, then thicken the canopy between them, so the mass has an
  // interior rather than being a ring of pom-poms on stick ends.
  for (const tip of tips) bloom(g, tip.x, tip.y, bloomR - (tip.depth > maxDepth - 2 ? 1 : 0));
  for (let i = 0; i + 1 < tips.length; i += 2) {
    const a = tips[i]!;
    const b = tips[i + 1]!;
    bloom(g, (a.x + b.x) >> 1, (a.y + b.y) >> 1, Math.max(2, bloomR - 2));
  }

  if (opts.ground !== false) {
    for (let x = 0; x < gw; x++) {
      // The moss only reaches as far as the roots do.
      const reach = Math.abs(x - cx);
      if (reach > (w >> 2) + (hash(x, seed) % 3)) continue;
      put(g, x, groundY, "m");
    }
  }

  return trim(g);
}

export interface SandOptions {
  seed?: number;
  w?: number;
  h?: number;
  /** Cells between rake lines. */
  pitch?: number;
  /** The stone the rings are raked around, in cells. */
  focus?: readonly [number, number];
  /** How many rings before the pattern relaxes into straight lines. */
  rings?: number;
  /** Rake the ground beyond the outermost ring into straight lines. */
  straighten?: boolean;
}

/**
 * Raked sand.
 *
 * Concentric rings around the stone, straight lines beyond them — a karesansui in two
 * rules. The rings are found by comparing a squared distance against squared radii, so
 * no square root is taken and no two engines can disagree about where a line falls. The
 * band widens with the radius because the derivative of r squared is 2r, which is the
 * only way to keep the line one cell thick all the way out.
 */
export function sandGrid(opts: SandOptions = {}): Grid {
  const w = opts.w ?? 80;
  const h = opts.h ?? 40;
  const pitch = opts.pitch ?? 4;
  const rings = opts.rings ?? 6;
  const seed = opts.seed ?? 3;
  const [fx, fy] = opts.focus ?? [w >> 2, h >> 1];

  const g = blank(w, h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - fx;
      const dy = (y - fy) * 2; // sand is read at an angle, so the rings are ellipses
      const d2 = dx * dx + dy * dy;

      let drawn = false;
      for (let k = 1; k <= rings; k++) {
        const r = k * pitch;
        const band = r; // == 2r/2, one cell of line at every radius
        if (Math.abs(d2 - r * r) <= band) {
          put(g, x, y, "s");
          drawn = true;
          break;
        }
      }
      if (drawn) continue;

      // Past the outermost ring the rake straightens out — but only when asked. A
      // half-ringed, half-striped patch reads as two patterns rather than one garden,
      // so a sprite that is all rings simply sets enough rings to reach its corners.
      if (!opts.straighten) continue;
      const outer = rings * pitch;
      if (d2 > outer * outer && (y + ((hash(y, seed) % 2) === 0 ? 0 : 1)) % pitch === 0) {
        put(g, x, y, "s");
      }
    }
  }

  return g;
}

export interface MossOptions {
  seed?: number;
  w?: number;
  h?: number;
  /** 0..100. Past about 60 it stops reading as clumps. */
  coverage?: number;
}

/** A patch of moss: seeded clumps, not a fill. */
export function mossGrid(opts: MossOptions = {}): Grid {
  const w = opts.w ?? 40;
  const h = opts.h ?? 8;
  const seed = opts.seed ?? 5;
  const coverage = opts.coverage ?? 40;
  const rnd = mulberry32(seed);
  const g = blank(w, h);

  const clumps = Math.max(2, (w * coverage) / 220) | 0;
  for (let i = 0; i < clumps; i++) {
    const cx = randInt(rnd, 0, w - 1);
    const cy = randInt(rnd, h >> 1, h - 1);
    const r = randInt(rnd, 2, 4);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 > r * r) continue;
        if (d2 > r * r - r && (hash(cx + dx, cy + dy) & 1) === 0) continue;
        put(g, cx + dx, cy + dy, (hash(cx + dx, cy + dy) % 5) === 0 ? "g" : "m");
      }
    }
  }
  return g;
}

export interface ScatterOptions {
  seed?: number;
  w?: number;
  h?: number;
  count?: number;
}

/** Fallen petals. What a tree leaves on the ground once it has been there a while. */
export function scatterGrid(opts: ScatterOptions = {}): Grid {
  const w = opts.w ?? 60;
  const h = opts.h ?? 10;
  const seed = opts.seed ?? 7;
  const count = opts.count ?? 24;
  const rnd = mulberry32(seed);
  const g = blank(w, h);

  for (let i = 0; i < count; i++) {
    const x = randInt(rnd, 0, w - 2);
    // Petals pile up where they land, so the lower rows get more of them.
    const y = Math.min(h - 1, randInt(rnd, 0, h - 1) + randInt(rnd, 0, 1));
    const tone = "abc"[randInt(rnd, 0, 2)]!;
    put(g, x, y, tone);
    if (chance(rnd, 0.45)) put(g, x + 1, y, tone);
  }
  return g;
}

/**
 * A hillside: moss, a few stones, some fallen petals. The strip that runs under a
 * section and turns a horizontal rule into a place.
 */
export function groundGrid(opts: { seed?: number; w?: number; h?: number } = {}): Grid {
  const w = opts.w ?? 96;
  const h = opts.h ?? 10;
  const seed = opts.seed ?? 11;
  const rnd = mulberry32(seed);
  const g = blank(w, h);

  // A rolling top edge, walked one cell at a time so it never jumps.
  let top = h - 3;
  for (let x = 0; x < w; x++) {
    if (chance(rnd, 0.22)) top += chance(rnd, 0.5) ? 1 : -1;
    if (top < 2) top = 2;
    if (top > h - 2) top = h - 2;
    for (let y = top; y < h; y++) {
      put(g, x, y, y === top ? "g" : "m");
    }
  }

  for (let i = 0; i < w / 18; i++) {
    const x = randInt(rnd, 2, w - 4);
    let y = 0;
    while (y < h && get(g, x, y) === ".") y++;
    put(g, x, y - 1, "a");
  }

  return g;
}

/** The three-frame koi strip, laid out side by side for a `steps(3)` sprite sheet. */
export function strip(frames: readonly Grid[]): Grid {
  const h = frames[0]!.length;
  const rows: string[] = [];
  for (let y = 0; y < h; y++) rows.push(frames.map((f) => f[y]!).join(""));
  return rows;
}

/** Draw a line into a fresh grid. Used by the mechanism scene. */
export function strokeGrid(w: number, h: number, pts: ReadonlyArray<readonly [number, number]>, k = "s"): Grid {
  const g = blank(w, h);
  for (let i = 0; i + 1 < pts.length; i++) {
    line(g, pts[i]![0], pts[i]![1], pts[i + 1]![0], pts[i + 1]![1], k);
  }
  return g;
}
