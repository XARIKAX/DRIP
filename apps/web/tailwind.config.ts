import type { Config } from "tailwindcss";

/**
 * Osinko design system — light chrome, dark data.
 *
 * The canvas is white paper and stays white paper. Structure is drawn with hairlines
 * rather than boxes inside boxes. One accent, cyan, used as punctuation: a live value,
 * a state change, a single call to action per screen. Colour is never decoration.
 *
 * The one inversion is deliberate and load bearing: anything that is *data* — a stat
 * strip, the dashboard, the mechanism scene, a numbers band — runs on a near-black
 * panel. That contrast between paper chrome and black data is the product's signature,
 * and it is the reason a screen full of numbers reads as an instrument rather than a
 * marketing page.
 *
 * Geometry has one rule and one exception. The rule: rectangles are structure, so every
 * panel, field, table and button is square cornered. The exception: pills are
 * annotations — status chips, floating labels, metadata. Nothing else is ever rounded.
 *
 * Type has three roles that never trade places. Archivo sets display and UI. IBM Plex
 * Mono sets every number, label and machine-readable string. Newsreader italic appears
 * only as an editorial kicker, at most once per section.
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
        // Paper. Each step is a wash, never a border.
        paper: "#FFFFFF",
        "paper-2": "#F6F7F8",
        "paper-3": "#EDEFF1",
        "paper-4": "#E3E6E9",

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
        sans: ["Archivo", "Helvetica Neue", "Helvetica", "Arial", "sans-serif"],
        mono: ["IBM Plex Mono", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
        editorial: ["Newsreader", "Iowan Old Style", "Georgia", "serif"],
      },
      letterSpacing: {
        cut: "-0.055em",
        tightest: "-0.04em",
        tighter: "-0.025em",
        wide: "0.08em",
        widest: "0.18em",
        mega: "0.32em",
      },
      fontSize: {
        // Machine labels. Small, tracked wide, always uppercase mono.
        nano: ["9px", { lineHeight: "1.1", letterSpacing: "0.24em" }],
        micro: ["10px", { lineHeight: "1.2", letterSpacing: "0.18em" }],
        label: ["11px", { lineHeight: "1.3", letterSpacing: "0.14em" }],
        // Display. The scale is deliberately violent: 10:1 against the labels.
        colossal: ["clamp(64px, 12vw, 190px)", { lineHeight: "0.82", letterSpacing: "-0.055em" }],
        hero: ["clamp(46px, 7.6vw, 112px)", { lineHeight: "0.88", letterSpacing: "-0.05em" }],
        display: ["clamp(33px, 4.3vw, 62px)", { lineHeight: "0.95", letterSpacing: "-0.04em" }],
        headline: ["clamp(26px, 3.2vw, 42px)", { lineHeight: "1.0", letterSpacing: "-0.03em" }],
        title: ["clamp(19px, 1.8vw, 24px)", { lineHeight: "1.15", letterSpacing: "-0.02em" }],
      },
      maxWidth: {
        shell: "1440px",
        prose: "62ch",
      },
      spacing: {
        gut: "clamp(20px, 4vw, 56px)",
        band: "clamp(80px, 12vw, 176px)",
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
        panel: "0 1px 0 0 rgba(255,255,255,0.06) inset, 0 30px 70px -28px rgba(10,10,10,0.45)",
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
