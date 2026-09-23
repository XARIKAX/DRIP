/**
 * The palette, in literal hex.
 *
 * Inline SVG cannot resolve a Tailwind class, and reading a CSS custom property with
 * `getComputedStyle` at render time is a hydration hazard — the server has no computed
 * style, so the first client paint disagrees with the markup. So the handful of places
 * that paint SVG from JavaScript import these instead, and this file is the one place
 * a colour is written twice: here and in `globals.css`. Keep them in step.
 */
export const PALETTE = {
  iris: {
    100: "#E4D6FF",
    200: "#CBB0FF",
    300: "#AC85FB",
    400: "#8B5CF6",
    500: "#7B2FF7",
    600: "#6320D6",
    700: "#4E17A8",
    800: "#341070",
    900: "#1F0846",
  },
  blossom: {
    100: "#FFDCE8",
    200: "#FFBBD3",
    300: "#FF93BC",
    400: "#F56AA4",
    500: "#DE4886",
    700: "#8A2050",
  },
  night: {
    0: "#0A0510",
    1: "#0F0719",
    2: "#150A24",
    3: "#1D1030",
    4: "#2A1A42",
    text: "#F1EBFF",
    muted: "#A99BC4",
    faint: "#8A7BA8",
    edge: "rgba(233,224,255,0.20)",
    edgeSoft: "rgba(233,224,255,0.09)",
  },
  ink: "#160E22",
  muted: "#5B4E72",
  faint: "#6F6289",
  ground: "#F6F4FB",
  paper: "#FFFFFF",
  up: "#0F7454",
  upBright: "#48D6A0",
  down: "#B0402A",
  downBright: "#FF7A66",
  vermilion: "#E0533A",
} as const;

/**
 * The Stack builder's ring accents.
 *
 * The one place in the product where colour identifies a *thing* rather than a state, so
 * it sits outside the iris/blossom rule instead of bending it: a ring painted in five
 * tints of one violet would be unreadable, and an allocation nobody can read is not an
 * allocation.
 *
 * Two ramps, and the split carries meaning. Stocks take the six-colour ramp — six
 * because a Stack holds six assets, so no two segments ever share a hue. A token
 * somebody imported takes violet, which is the house accent and is deliberately absent
 * from the stock ramp: on a ring of green, coral and azure arcs, the violet one is the
 * asset that was not on the shelf. That is worth a colour.
 *
 * Every hue clears 4.5:1 against the chamber's near-black ground and stays separable
 * under the common forms of colour blindness — which is also why colour never names an
 * asset on its own: every badge and legend row carries its ticker beside its dot.
 */
export const STOCK_ACCENTS = [
  "#78EC51", // spring
  "#FF6574", // coral
  "#4B9FFF", // azure
  "#FFC24B", // amber
  "#3BE0C8", // teal
  "#FF8FD0", // rose
] as const;

/** Imported tokens. Violet, because it is the one thing here that is yours. */
export const TOKEN_ACCENTS = ["#A855F7", "#C48CFF", "#8B5CF6"] as const;

/** The accent for a slot, wrapping defensively rather than returning undefined. */
export function stackAccent(slot: number, kind: "stock" | "token" = "stock"): string {
  const ramp = kind === "token" ? TOKEN_ACCENTS : STOCK_ACCENTS;
  return ramp[((slot % ramp.length) + ramp.length) % ramp.length]!;
}

/** The two type stacks SVG `font-family` attributes need spelled out. */
export const SVG_MONO = "IBM Plex Mono, SFMono-Regular, Menlo, Consolas, monospace";
export const SVG_SANS = "Instrument Sans, Helvetica Neue, Helvetica, Arial, sans-serif";
export const SVG_DISPLAY = "Archivo, Helvetica Neue, Helvetica, Arial, sans-serif";
