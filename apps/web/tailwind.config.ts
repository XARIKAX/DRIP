import type { Config } from "tailwindcss";

/**
 * NYSE institutional.
 *
 * White paper, near black ink, one cyan accent, and nothing else. No radius anywhere:
 * every corner in this product is square. Numbers are set in mono because numbers are
 * the decoration.
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
        },
        rule: "#0A0A0A",
        muted: "#6B6B6B",
        faint: "#E5E5E5",
        wash: "#F6F6F6",
        up: "#0E8A5F",
        down: "#C0392B",
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
        micro: ["10px", { lineHeight: "1.2", letterSpacing: "0.14em" }],
        hero: ["clamp(2.75rem, 7vw, 6rem)", { lineHeight: "0.92", letterSpacing: "-0.045em" }],
        display: ["clamp(2rem, 4.5vw, 3.5rem)", { lineHeight: "0.96", letterSpacing: "-0.035em" }],
      },
      maxWidth: {
        shell: "1320px",
      },
    },
  },
  plugins: [],
};

export default config;
