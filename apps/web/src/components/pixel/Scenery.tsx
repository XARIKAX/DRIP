import type { CSSProperties } from "react";
import { PixelSprite } from "./Sprite";
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

/**
 * The garden, as things you can place.
 *
 * Generated sprites are built once at module scope rather than per render: a tree is a
 * constant, the same one every time, so growing it inside a component would be paying
 * for the same answer on every paint — and on the mechanism scene, sixty times a second.
 */

const TREES = [
  sakuraGrid({ seed: 7, w: 62, h: 70, bloom: 6, depth: 5, lean: -2 }),
  sakuraGrid({ seed: 23, w: 58, h: 66, bloom: 5, depth: 5, lean: 2 }),
  sakuraGrid({ seed: 41, w: 46, h: 52, bloom: 5, depth: 4 }),
  sakuraGrid({ seed: 89, w: 40, h: 44, bloom: 4, depth: 4, lean: 1 }),
];

const BRANCHES = [
  sakuraGrid({ seed: 13, w: 34, h: 30, bloom: 4, depth: 3, ground: false }),
  sakuraGrid({ seed: 57, w: 30, h: 26, bloom: 4, depth: 3, ground: false }),
];

export function SakuraTree({
  seed = 0,
  scale = 1,
  variant = "full",
  title,
  className = "",
  style,
}: {
  /** Picks one of the grown trees. Not a random seed at render time — an index. */
  seed?: number;
  scale?: number;
  variant?: "full" | "branch";
  title?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const pool = variant === "branch" ? BRANCHES : TREES;
  const grid = pool[Math.abs(seed) % pool.length]!;
  return <PixelSprite grid={grid} palette={SAKURA} scale={scale} title={title} className={className} style={style} />;
}

export function StoneLantern({
  scale = 1,
  lit = true,
  className = "",
  style,
}: {
  scale?: number;
  lit?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <PixelSprite
      grid={LANTERN}
      palette={lit ? STONE : { ...STONE, f: "var(--pk-stone-dark)", F: "var(--pk-stone)" }}
      scale={scale}
      className={`${lit ? "flicker" : ""} ${className}`}
      style={style}
    />
  );
}

export function Torii({ scale = 1, className = "", style }: { scale?: number; className?: string; style?: CSSProperties }) {
  return <PixelSprite grid={TORII_GATE} palette={TORII} scale={scale} className={className} style={style} />;
}

export function Bridge({ scale = 1, className = "", style }: { scale?: number; className?: string; style?: CSSProperties }) {
  return <PixelSprite grid={BRIDGE} palette={STONE} scale={scale} className={className} style={style} />;
}

export function Sapling({ scale = 1, className = "", style }: { scale?: number; className?: string; style?: CSSProperties }) {
  return <PixelSprite grid={SAPLING} palette={SAKURA} scale={scale} className={className} style={style} />;
}

export function Bamboo({ scale = 1, className = "", style }: { scale?: number; className?: string; style?: CSSProperties }) {
  return <PixelSprite grid={BAMBOO} palette={SAKURA} scale={scale} className={className} style={style} />;
}

const STONES = [STONE_LARGE, STONE_MID, STONE_SMALL];

export function Stone({
  size = 0,
  scale = 1,
  className = "",
  style,
}: {
  size?: 0 | 1 | 2;
  scale?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return <PixelSprite grid={STONES[size]!} palette={STONE} scale={scale} className={className} style={style} />;
}

export function PixelCoin({ scale = 1, className = "", style }: { scale?: number; className?: string; style?: CSSProperties }) {
  return <PixelSprite grid={COIN_SPRITE} palette={COIN} scale={scale} className={className} style={style} />;
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
  className = "",
  style,
}: {
  swim?: boolean;
  facing?: "left" | "right";
  scale?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const grid = facing === "right" ? KOI_STRIP_RIGHT : KOI_STRIP_LEFT;
  const unit = `calc(var(--cell) * ${Math.max(1, Math.round(scale))})`;
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
        style={swim ? { animation: "koi-swim 0.45s steps(3) infinite" } : undefined}
      />
    </span>
  );
}

const SAND_WIDE = sandGrid({ seed: 3, w: 120, h: 44, pitch: 5, rings: 7, focus: [34, 22] });
const MOSS_STRIP = mossGrid({ seed: 5, w: 64, h: 8, coverage: 45 });
const SCATTER = scatterGrid({ seed: 7, w: 72, h: 10, count: 30 });
const GROUND = groundGrid({ seed: 11, w: 120, h: 12 });

export function RakedSand({ scale = 1, className = "", style }: { scale?: number; className?: string; style?: CSSProperties }) {
  return <PixelSprite grid={SAND_WIDE} palette={SAND} scale={scale} className={className} style={style} />;
}

export function MossPatch({ scale = 1, className = "", style }: { scale?: number; className?: string; style?: CSSProperties }) {
  return <PixelSprite grid={MOSS_STRIP} palette={SAKURA} scale={scale} className={className} style={style} />;
}

export function FallenPetals({ scale = 1, className = "", style }: { scale?: number; className?: string; style?: CSSProperties }) {
  return <PixelSprite grid={SCATTER} palette={SAKURA} scale={scale} className={className} style={style} />;
}

/** The hillside that runs under a section and turns a rule into a place. */
export function GroundLine({ scale = 1, className = "", style }: { scale?: number; className?: string; style?: CSSProperties }) {
  return <PixelSprite grid={GROUND} palette={SAKURA} scale={scale} className={className} style={style} />;
}
