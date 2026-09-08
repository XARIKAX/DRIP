import type { Palette } from "./raster";

/**
 * Palettes.
 *
 * Every value is a CSS custom property rather than a colour, which is the whole trick:
 * a lantern drawn once is stone and warm light on the paper sections, and the same
 * lantern inside a `.night` surface is bruised violet with a brighter flame, with no
 * second sprite and no second palette. `globals.css` owns both sets of `--pk-*`.
 */

export const STONE: Palette = {
  o: "var(--pk-stone-line)",
  s: "var(--pk-stone)",
  l: "var(--pk-stone-dark)",
  f: "var(--pk-flame)",
  F: "var(--pk-bloom-1)",
  m: "var(--pk-moss)",
};

export const SAKURA: Palette = {
  t: "var(--pk-bark)",
  T: "var(--pk-bark-lit)",
  a: "var(--pk-bloom-1)",
  b: "var(--pk-bloom-2)",
  c: "var(--pk-bloom-3)",
  d: "var(--pk-bloom-4)",
  m: "var(--pk-moss)",
  g: "var(--pk-leaf)",
};

export const KOI: Palette = {
  k: "var(--pk-koi)",
  K: "var(--pk-koi-2)",
  o: "var(--pk-bark)",
};

export const TORII: Palette = {
  o: "var(--pk-bark)",
  t: "var(--pk-torii)",
};

export const SAND: Palette = {
  s: "var(--pk-sand-line)",
  o: "var(--pk-stone-line)",
  l: "var(--pk-stone-dark)",
  m: "var(--pk-moss)",
};

export const COIN: Palette = {
  r: "var(--pk-bloom-2)",
  g: "var(--pk-bloom-1)",
  m: "var(--pk-bloom-4)",
  w: "var(--pk-bloom-3)",
};
