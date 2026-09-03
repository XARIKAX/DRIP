import type { Config } from "tailwindcss";

/**
 * Osinko design system — the engraved certificate.
 *
 * The concept is not a mood, it is an argument. Osinko replaces the oldest paperwork in
 * finance: the share certificate with a dividend coupon attached along a perforation.
 * So the product is built in the visual language of that document — didone display type,
 * guilloché engine-turning, serial numbers, engraved rules, and an inked stamp — with
 * mono data as the modern half. Every ornament here is load bearing; nothing is applied
 * because it looked nice.
 *
 * The page is warm stock and stays warm stock. Structure is drawn with hairlines rather
 * than boxes inside boxes. One accent, cyan, behaves as stamp ink: a live value, a state
 * change, one call to action per screen. Colour is never decoration.
 *
 * Black appears rarely and only where it means something. Anything that is *data* — the
 * mechanism scene, the universe table, the dashboard — runs on a near-black panel; prose
 * never does. That restraint is what stops the inversion reading as dark components
 * dropped onto a blank document.
 *
 * Geometry has one rule and one exception. The rule: rectangles are structure, so every
 * panel, field, table and button is square cornered. The exception: pills are
 * annotations — status chips, floating labels, metadata. Nothing else is ever rounded.
 *
 * Type has four roles that never trade places. Bodoni Moda sets display. Archivo sets UI
 * and body. IBM Plex Mono sets every number, label and machine-readable string.
 * Newsreader italic appears only as an editorial kicker, at most once per section.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    borderRadius: {
      none: "0",
      DEFAULT: "0",
      full: "9999px",
    },
    extend: {
      colors: {
        // Paper. The page is warm stock; raised surfaces are brighter, so a certificate
        // sits *on* the ground rather than being cut out of it. Pure #FFF as a canvas is
        // the single loudest tell of a page nobody art-directed.
        ground: "#FAFAF7",
        paper: "#FFFFFF",
        "paper-2": "#F4F4F1",
        "paper-3": "#EBEBE7",
        "paper-4": "#E1E1DC",

        // Ink.
        ink: "#0A0A0A",
        muted: "#5B6167",
        faint: "#8A9098",
        ghost: "#B7BCC1",

        // Structure. Hairlines only — the system has no heavy borders.
        line: "rgba(10, 10, 10, 0.11)",
        "line-soft": "rgba(10, 10, 10, 0.06)",
        "line-strong": "rgba(10, 10, 10, 0.24)",

        // The accent. Bright cyan fills and rules; the deeper steps carry small type,
        // because #35C2DB on white is a 1.9:1 contrast and unreadable at label sizes.
        cyan: {
          DEFAULT: "#35C2DB",
          bright: "#5FD9EE",
          dark: "#1899B1",
          deep: "#0B6B7E",
          soft: "rgba(53, 194, 219, 0.10)",
        },

        // Dark data surfaces.
        panel: "#0A0C0F",
        "panel-2": "#101419",
        "panel-3": "#171C22",
        "panel-line": "rgba(255, 255, 255, 0.09)",
        "panel-edge": "rgba(255, 255, 255, 0.18)",
        "panel-text": "#F3F6F8",
        "panel-muted": "#8B949C",
        "panel-faint": "#5A636B",

        up: "#0E8A5F",
        down: "#C0392B",
      },
      fontFamily: {
        // Bodoni is not a style choice, it is the concept. A didone is the typeface of
        // engraved share certificates, bank notes and share ledgers — the documents this
        // product replaces. It does every piece of display work and nothing else.
        display: ["Bodoni Moda", "Didot", "Times New Roman", "serif"],
        sans: ["Archivo", "Helvetica Neue", "Helvetica", "Arial", "sans-serif"],
        mono: ["IBM Plex Mono", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
        editorial: ["Newsreader", "Iowan Old Style", "Georgia", "serif"],
      },
      letterSpacing: {
        cut: "-0.035em",
        tightest: "-0.025em",
        tighter: "-0.015em",
        wide: "0.08em",
        widest: "0.18em",
        mega: "0.32em",
      },
      fontSize: {
        // Machine labels. Small, tracked wide, always uppercase mono.
        nano: ["9px", { lineHeight: "1.1", letterSpacing: "0.24em" }],
        micro: ["10px", { lineHeight: "1.2", letterSpacing: "0.18em" }],
        label: ["11px", { lineHeight: "1.3", letterSpacing: "0.14em" }],
        // Display, set in Bodoni. A didone needs looser tracking and more leading than
        // a grotesque — the thin strokes need air or the whole line greys out.
        colossal: ["clamp(70px, 13vw, 210px)", { lineHeight: "0.86", letterSpacing: "-0.03em" }],
        hero: ["clamp(52px, 8.4vw, 128px)", { lineHeight: "0.94", letterSpacing: "-0.025em" }],
        display: ["clamp(36px, 4.8vw, 72px)", { lineHeight: "1.02", letterSpacing: "-0.02em" }],
        headline: ["clamp(27px, 3.3vw, 44px)", { lineHeight: "1.1", letterSpacing: "-0.015em" }],
        title: ["clamp(20px, 1.9vw, 26px)", { lineHeight: "1.2", letterSpacing: "-0.01em" }],
      },
      maxWidth: {
        shell: "1440px",
        prose: "62ch",
      },
      spacing: {
        gut: "clamp(20px, 4vw, 56px)",
        band: "clamp(72px, 10vw, 148px)",
      },
      transitionTimingFunction: {
        // The house curve. Everything decelerates; nothing bounces.
        osk: "cubic-bezier(0.16, 1, 0.3, 1)",
        swift: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      boxShadow: {
        // Light falls from above. On paper the shadow is the only depth cue there is,
        // so it is soft, cool and never larger than the object casting it.
        lift: "0 1px 2px rgba(10,10,10,0.04), 0 8px 24px -12px rgba(10,10,10,0.10)",
        float: "0 1px 2px rgba(10,10,10,0.05), 0 24px 60px -24px rgba(10,10,10,0.22)",
        panel: "0 1px 0 0 rgba(255,255,255,0.06) inset, 0 18px 44px -28px rgba(10,10,10,0.28)",
        glow: "0 0 0 1px rgba(53,194,219,0.45), 0 0 30px -6px rgba(53,194,219,0.40)",
      },
      zIndex: {
        chrome: "60",
        veil: "70",
      },
    },
  },
  plugins: [],
};

export default config;
