import type { CSSProperties } from "react";
import { PixelSprite, PixelStrip } from "./Sprite";
import { COIN, KOI, SAKURA, SAND, STONE, TORII } from "./palette";
import { groundGrid, mossGrid, sakuraGrid, sandGrid, scatterGrid, strip } from "./generate";
import {
  BAMBOO,
  BRIDGE,
  COIN_SPRITE,
  KOI_FRAMES,
  KOI_FRAMES_RIGHT,
  LANTERN,
  SAPLING,
  STONE_LARGE,
  STONE_MID,
  STONE_SMALL,
  TORII_GATE,
} from "./sprites";
import { gridSize } from "./raster";

/** What every placeable object in the garden accepts. */
export interface PlaceableProps {
  /** Whole cells per pixel. */
  scale?: number;
  /** Any CSS length, for the cases a whole cell is too coarse. */
  cell?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * The garden, as things you can place.
 *
 * Generated sprites are built once at module scope rather than per render: a tree is a
 * constant, the same one every time, so growing it inside a component would be paying
 * for the same answer on every paint — and on the mechanism scene, sixty times a second.
 */

/*
 * A tree does not carry its own ground. The section it stands in provides that, and a
 * sprite that brings a strip of moss with it leaves a green hairline every time it is
 * cropped by an edge — which, in a corner of the hero, is always.
 */
const TREES = [
  sakuraGrid({ seed: 7, w: 62, h: 70, bloom: 6, depth: 5, lean: -2, ground: false }),
  sakuraGrid({ seed: 23, w: 58, h: 66, bloom: 5, depth: 5, lean: 2, ground: false }),
  sakuraGrid({ seed: 41, w: 46, h: 52, bloom: 5, depth: 4, ground: false }),
  sakuraGrid({ seed: 89, w: 40, h: 46, bloom: 4, depth: 4, lean: 1, ground: false }),
  sakuraGrid({ seed: 137, w: 44, h: 50, bloom: 5, depth: 4, lean: -1, ground: false }),
  sakuraGrid({ seed: 211, w: 38, h: 42, bloom: 4, depth: 4, ground: false }),
];

const BRANCHES = [
  sakuraGrid({ seed: 13, w: 34, h: 30, bloom: 4, depth: 3, ground: false }),
  sakuraGrid({ seed: 57, w: 30, h: 26, bloom: 4, depth: 3, ground: false }),
];

export function SakuraTree({
  seed = 0,
  scale = 1,
  cell,
  variant = "full",
  title,
  className = "",
  style,
}: PlaceableProps & {
  /** Picks one of the grown trees. Not a random seed at render time — an index. */
  seed?: number;
  variant?: "full" | "branch";
  title?: string;
}) {
  const pool = variant === "branch" ? BRANCHES : TREES;
  const grid = pool[Math.abs(seed) % pool.length]!;
  return (
    <PixelSprite grid={grid} palette={SAKURA} scale={scale} cell={cell} title={title} className={className} style={style} />
  );
}

export function StoneLantern({
  scale = 1,
  cell,
  lit = true,
  className = "",
  style,
}: PlaceableProps & { lit?: boolean }) {
  return (
    <PixelSprite
      grid={LANTERN}
      palette={lit ? STONE : { ...STONE, f: "var(--pk-stone-dark)", F: "var(--pk-stone)" }}
      scale={scale}
      cell={cell}
      className={`${lit ? "flicker" : ""} ${className}`}
      style={style}
    />
  );
}

export function Torii({ scale = 1, cell, className = "", style }: PlaceableProps) {
  return <PixelSprite grid={TORII_GATE} palette={TORII} scale={scale} cell={cell} className={className} style={style} />;
}

export function Bridge({ scale = 1, cell, className = "", style }: PlaceableProps) {
  return <PixelSprite grid={BRIDGE} palette={STONE} scale={scale} cell={cell} className={className} style={style} />;
}

export function Sapling({ scale = 1, cell, className = "", style }: PlaceableProps) {
  return <PixelSprite grid={SAPLING} palette={SAKURA} scale={scale} cell={cell} className={className} style={style} />;
}

export function Bamboo({ scale = 1, cell, className = "", style }: PlaceableProps) {
  return <PixelSprite grid={BAMBOO} palette={SAKURA} scale={scale} cell={cell} className={className} style={style} />;
}

const STONES = [STONE_LARGE, STONE_MID, STONE_SMALL];

export function Stone({
  size = 0,
  scale = 1,
  cell,
  className = "",
  style,
}: PlaceableProps & { size?: 0 | 1 | 2 }) {
  return <PixelSprite grid={STONES[size]!} palette={STONE} scale={scale} cell={cell} className={className} style={style} />;
}

export function PixelCoin({ scale = 1, cell, className = "", style }: PlaceableProps) {
  return <PixelSprite grid={COIN_SPRITE} palette={COIN} scale={scale} cell={cell} className={className} style={style} />;
}

const KOI_STRIP_LEFT = strip(KOI_FRAMES);
const KOI_STRIP_RIGHT = strip(KOI_FRAMES_RIGHT);
const KOI_FRAME_W = gridSize(KOI_FRAMES[0]!).w;

/**
 * A koi.
 *
 * The swim is one CSS keyframe stepping a three-frame strip inside a window one frame
 * wide — no animation loop, no state, and it stops on its own under reduced motion
 * because the global block turns every keyframe off. A rendering trick worth the two
 * lines it costs: an animation nobody has to remember to clean up.
 */
export function Koi({
  swim = true,
  facing = "left",
  scale = 1,
  cell,
  className = "",
  style,
}: PlaceableProps & { swim?: boolean; facing?: "left" | "right" }) {
  const grid = facing === "right" ? KOI_STRIP_RIGHT : KOI_STRIP_LEFT;
  const unit = cell ?? `calc(var(--cell) * ${Math.max(1, Math.round(scale))})`;
  return (
    <span
      className={`inline-block overflow-hidden align-middle ${className}`}
      style={{ width: `calc(${unit} * ${KOI_FRAME_W})`, ...style }}
      aria-hidden
    >
      <PixelSprite
        grid={grid}
        palette={KOI}
        scale={scale}
        cell={cell}
        style={swim ? { animation: "koi-swim 0.45s steps(3) infinite" } : undefined}
      />
    </span>
  );
}

const SAND_WIDE = sandGrid({ seed: 3, w: 120, h: 44, pitch: 5, rings: 7, focus: [34, 22], straighten: true });
const MOSS_STRIP = mossGrid({ seed: 5, w: 64, h: 8, coverage: 45 });
const SCATTER = scatterGrid({ seed: 7, w: 72, h: 10, count: 30 });
const GROUND = groundGrid({ seed: 11, w: 120, h: 12 });

export function RakedSand({ scale = 1, cell, className = "", style }: PlaceableProps) {
  return <PixelSprite grid={SAND_WIDE} palette={SAND} scale={scale} cell={cell} className={className} style={style} />;
}

export function MossPatch({ scale = 1, cell, className = "", style }: PlaceableProps) {
  return <PixelSprite grid={MOSS_STRIP} palette={SAKURA} scale={scale} cell={cell} className={className} style={style} />;
}

export function FallenPetals({ scale = 1, cell, className = "", style }: PlaceableProps) {
  return <PixelSprite grid={SCATTER} palette={SAKURA} scale={scale} cell={cell} className={className} style={style} />;
}

/**
 * The hillside that runs under a section and turns a rule into a place.
 *
 * Tiled rather than stretched. A horizon has to reach both edges of the page and a
 * sprite scaled to fit would land on fractional cells, which is the one thing this
 * system does not do. Its palette is resolved to literal colours because a background
 * image cannot see a custom property — so it is the day palette, and sections that
 * need the night one pass `nightPalette`.
 */
const GROUND_DAY = { t: "#4a2f42", T: "#6b4560", a: "#ffdce8", b: "#ffbbd3", c: "#ff93bc", d: "#f56aa4", m: "#6b9384", g: "#79a292" };
const GROUND_NIGHT = { t: "#2a1a42", T: "#45296b", a: "#ffbbd3", b: "#ff93bc", c: "#f56aa4", d: "#b62f68", m: "#35604f", g: "#3f7566" };

export function GroundLine({
  scale = 1,
  cell,
  night = false,
  className = "",
  style,
}: PlaceableProps & { night?: boolean }) {
  return (
    <PixelStrip
      grid={GROUND}
      palette={night ? GROUND_NIGHT : GROUND_DAY}
      scale={scale}
      cell={cell}
      className={className}
      style={style}
    />
  );
}
