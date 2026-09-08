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

/** The two type stacks SVG `font-family` attributes need spelled out. */
export const SVG_MONO = "IBM Plex Mono, SFMono-Regular, Menlo, Consolas, monospace";
export const SVG_SANS = "Instrument Sans, Helvetica Neue, Helvetica, Arial, sans-serif";
export const SVG_DISPLAY = "Archivo, Helvetica Neue, Helvetica, Arial, sans-serif";
