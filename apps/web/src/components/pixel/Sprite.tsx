import type { CSSProperties } from "react";
import { gridSize, toRuns, type Grid, type Palette } from "./raster";

/**
 * The one place a pixel is drawn.
 *
 * A server component with no effects and no state: the sprite is in the HTML that
 * leaves the server, so there is no frame where the garden is missing and nothing to
 * hydrate. Fills are CSS custom properties, so the same sprite lights differently
 * inside a `.night` surface without a second copy.
 *
 * Size is always `--cell` times a whole number. That is the rule the whole system
 * rests on; a sprite at 1.5 cells is a blurry photograph of pixel art.
 */
export function PixelSprite({
  grid,
  palette,
  scale = 1,
  cell,
  title,
  className = "",
  style,
}: {
  grid: Grid;
  palette: Palette;
  /** Whole cells per pixel. Must be an integer. */
  scale?: number;
  /** Overrides the cell unit entirely — any CSS length. */
  cell?: string;
  /** Present makes it an image with a name; absent makes it decoration. */
  title?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const { w, h } = gridSize(grid);
  const runs = toRuns(grid);
  const unit = cell ?? `calc(var(--cell) * ${Math.max(1, Math.round(scale))})`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      shapeRendering="crispEdges"
      className={`pixel block ${className}`}
      /* Size lives in CSS, not in the width/height attributes: an SVG geometry
         attribute takes a plain length and rejects calc(), and the whole point of
         `--cell` is that the size is computed. */
      style={{ width: `calc(${unit} * ${w})`, height: `calc(${unit} * ${h})`, ...style }}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {runs.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={palette[r.k] ?? "transparent"} />
      ))}
    </svg>
  );
}

/**
 * A sprite tiled across whatever width it is given.
 *
 * The reason this exists rather than a `w-full` on `PixelSprite`: stretching a sprite to
 * fit is exactly the thing the whole system refuses to do — it produces fractional
 * cells, which is a blurry photograph of pixel art rather than pixel art. A horizon has
 * to span the page, so it repeats at its true size instead, and the seam falls wherever
 * the viewport happens to end.
 *
 * It renders as a background image because that is the only way to repeat without
 * emitting the same few hundred rectangles once per tile.
 */
export function PixelStrip({
  grid,
  palette,
  scale = 1,
  cell,
  className = "",
  style,
}: {
  grid: Grid;
  palette: Palette;
  scale?: number;
  cell?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const { w, h } = gridSize(grid);
  const runs = toRuns(grid);
  const unit = cell ?? `calc(var(--cell) * ${Math.max(1, Math.round(scale))})`;

  // Custom properties do not survive into a background image, so the palette is
  // resolved to literal values here. Callers pass a resolved palette for tiled art.
  const rects = runs
    .map((r) => `<rect x='${r.x}' y='${r.y}' width='${r.w}' height='${r.h}' fill='${palette[r.k] ?? "none"}'/>`)
    .join("");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}' width='${w}' height='${h}' shape-rendering='crispEdges'>${rects}</svg>`;

  return (
    <div
      aria-hidden
      className={`pixel ${className}`}
      style={{
        height: `calc(${unit} * ${h})`,
        backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
        backgroundRepeat: "repeat-x",
        backgroundSize: `calc(${unit} * ${w}) calc(${unit} * ${h})`,
        backgroundPosition: "left bottom",
        ...style,
      }}
    />
  );
}
