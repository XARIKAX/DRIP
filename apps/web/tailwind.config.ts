import type { Config } from "tailwindcss";

/**
 * Osinko design system — "the terminal, made beautiful".
 *
 * The canvas is near black and stays near black. Structure is drawn with hairlines,
 * never with boxes-inside-boxes. One accent, cyan, used as punctuation: a live value,
 * a state change, a single call to action per screen. Colour is never decoration.
 *
 * Geometry has exactly one rule and one exception. The rule: rectangles are structure,
 * so every panel, field, table and button is square cornered. The exception: pills are
 * annotations — status chips, floating labels, metadata. Nothing else is ever rounded.
 *
 * Type has three roles and they never trade places. Archivo sets display and UI.
 * IBM Plex Mono sets every number, label and machine-readable string. Newsreader italic
 * appears only as an editorial kicker, at most once per section.
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
        // Canvas and surfaces. Each step is a lift of light, not a border.
        void: "#06080A",
        "void-deep": "#030405",
        surface: "#0B0E11",
        "surface-2": "#101418",
        "surface-3": "#161B20",
        "surface-4": "#1D242A",

        // Structure. Hairlines only — the system has no heavy borders.
        line: "rgba(255, 255, 255, 0.10)",
        "line-soft": "rgba(255, 255, 255, 0.055)",
        "line-strong": "rgba(255, 255, 255, 0.20)",

        // Type.
        chalk: "#F3F6F8",
        dim: "#8B949C",
        faint: "#5A636B",
        ghost: "#39424A",

        // The accent.
        cyan: {
          DEFAULT: "#35C2DB",
          bright: "#5FD9EE",
          dark: "#1899B1",
          deep: "#0E5C6C",
          soft: "rgba(53, 194, 219, 0.10)",
        },

        up: "#2ED3A7",
        down: "#FF6B6B",

        // Retained so the legacy light chrome (OG image, print) still resolves.
        ink: "#0A0A0A",
        paper: "#FFFFFF",
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
        // The step below the hero. Kept short of the hero on purpose: a section head
        // that competes with the headline flattens the page into one loud plane.
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
        band: "clamp(80px, 12vw, 180px)",
      },
      transitionTimingFunction: {
        // The house curve. Everything decelerates; nothing bounces.
        osk: "cubic-bezier(0.16, 1, 0.3, 1)",
        swift: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      boxShadow: {
        // Light falls from above and is always cold.
        lift: "0 1px 0 0 rgba(255,255,255,0.06) inset, 0 24px 60px -20px rgba(0,0,0,0.85)",
        float: "0 1px 0 0 rgba(255,255,255,0.08) inset, 0 40px 90px -24px rgba(0,0,0,0.9)",
        glow: "0 0 0 1px rgba(53,194,219,0.35), 0 0 40px -6px rgba(53,194,219,0.45)",
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
