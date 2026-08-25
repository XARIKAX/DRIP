import type { Config } from "tailwindcss";

/**
 * NYSE structure, Bloomberg confidence, TradingView data quality.
 *
 * Light chrome carries the brand: white paper, near black ink, one cyan accent,
 * square corners, hairline rules. The app's data surfaces run dark: #0C0E10 panels
 * with #15181B hairlines and mono numbers in white and cyan. That contrast is the
 * signature of the app side. Numbers are always IBM Plex Mono. Never mix type roles.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    // Sharp corners are not a default to be overridden, they are the rule.
    borderRadius: {
      none: "0",
      DEFAULT: "0",
      full: "9999px",
    },
    extend: {
      colors: {
        ink: "#0A0A0A",
        paper: "#FFFFFF",
        cyan: {
          DEFAULT: "#35C2DB",
          dark: "#1899B1",
          soft: "rgba(53, 194, 219, 0.08)",
        },
        muted: "#6B6B6B",
        faint: "#E5E5E5",
        hairline: "rgba(10, 10, 10, 0.12)",
        wash: "#F6F6F6",
        up: "#0E8A5F",
        down: "#C0392B",
        // Dark data surfaces
        panel: "#0C0E10",
        "panel-2": "#101317",
        "panel-line": "#15181B",
        "panel-edge": "#1D2126",
        "panel-muted": "#8A9096",
        "panel-faint": "#4A5058",
      },
      fontFamily: {
        sans: ["Archivo", "Helvetica Neue", "Helvetica", "Arial", "sans-serif"],
        mono: ["IBM Plex Mono", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      letterSpacing: {
        tightest: "-0.045em",
        tighter: "-0.03em",
        wide: "0.06em",
        widest: "0.14em",
      },
      fontSize: {
        micro: ["11px", { lineHeight: "1.2", letterSpacing: "0.14em" }],
        hero: ["clamp(56px, 8vw, 104px)", { lineHeight: "0.92", letterSpacing: "-0.03em" }],
        display: ["clamp(44px, 5vw, 56px)", { lineHeight: "0.98", letterSpacing: "-0.03em" }],
        headline: ["clamp(28px, 3vw, 36px)", { lineHeight: "1.02", letterSpacing: "-0.025em" }],
      },
      maxWidth: {
        shell: "1320px",
      },
      transitionTimingFunction: {
        drip: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      keyframes: {
        rise: {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-cell": {
          "0%": { backgroundColor: "rgba(53, 194, 219, 0.35)" },
          "100%": { backgroundColor: "transparent" },
        },
        "pulse-cell-dark": {
          "0%": { backgroundColor: "rgba(53, 194, 219, 0.22)" },
          "100%": { backgroundColor: "transparent" },
        },
        shimmer: {
          from: { backgroundPosition: "200% 0" },
          to: { backgroundPosition: "-200% 0" },
        },
        "draw-line": {
          from: { strokeDashoffset: "1" },
          to: { strokeDashoffset: "0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
      },
      animation: {
        rise: "rise 0.4s cubic-bezier(0.22, 1, 0.36, 1) both",
        "pulse-cell": "pulse-cell 0.7s ease-out",
        "pulse-cell-dark": "pulse-cell-dark 0.7s ease-out",
        shimmer: "shimmer 1.6s linear infinite",
        "fade-in": "fade-in 0.4s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
