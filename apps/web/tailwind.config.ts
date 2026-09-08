import type { Config } from "tailwindcss";

/**
 * Osinko design system — the night garden.
 *
 * The concept is a garden, and the argument is the same one the product makes: a garden
 * pays you without being cut down. You plant (deposit), the tree blossoms on a schedule
 * nobody negotiates (the ex date), petals fall continuously (the stream), and the ground
 * compounds (reinvest). Every ornament in here is that idea; nothing is applied because
 * it looked nice.
 *
 * The page is one vertical journey from a lavender dawn to a violet night, the same
 * journey the hero background makes, repeated at page scale. Prose is read in daylight;
 * data is read after dark. Which surface you are on is a *context*, not a second set of
 * class names — see `.night` in globals.css.
 *
 * Colour has one accent, iris, and one secondary, blossom. Iris is structure and state:
 * a live value, a call to action, the thing the cursor is about to touch. Blossom is the
 * garden itself and never carries a control. Neither is ever decoration.
 *
 * Geometry is soft everywhere. Hierarchy comes from the radius scale — a field is 12, a
 * card is 16, a panel is 20, an instrument is 28 — not from a square/round binary. Every
 * button is a pill, with no exceptions, because the one shape that is always the same is
 * how a system stops looking assembled.
 *
 * Type has four roles that never trade places. Archivo sets display. Instrument Sans sets
 * UI and body. Newsreader sets the serif register — the eyebrow, the kicker, the pull
 * quote, the drop cap. IBM Plex Mono sets every number, label and machine-readable
 * string, and is the one face carried over from the previous identity because it was
 * already doing its job.
 *
 * Fonts are self-hosted in /public/fonts. Nothing here reaches the network at build time
 * or at runtime.
 */

/** A channel-triplet variable, so Tailwind's `<alpha-value>` modifier keeps working. */
const ch = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    /*
     * A closed set, deliberately, and it lives in `theme` rather than `theme.extend` so
     * Tailwind's defaults do not merge back in and quietly redefine `rounded-sm` as 2px.
     */
    borderRadius: {
      none: "0",
      sm: "6px",
      DEFAULT: "10px",
      md: "12px",
      lg: "16px",
      xl: "20px",
      "2xl": "28px",
      "3xl": "40px",
      full: "9999px",
    },
    extend: {
      colors: {
        /* ---- Contextual. These flip under `.night`; most components use only these. --
           `paper` and the `ground` scale ARE the surface scale — there is deliberately
           no second `surface-*` vocabulary, because two names for one colour is how a
           design system rots, and because every existing screen already speaks this one. */
        paper: ch("--paper"),
        ground: {
          DEFAULT: ch("--ground"),
          2: ch("--ground-2"),
          3: ch("--ground-3"),
          4: ch("--ground-4"),
        },
        ink: ch("--text"),
        "ink-2": ch("--text-2"),
        muted: ch("--text-muted"),
        faint: ch("--text-faint"),
        ghost: ch("--text-ghost"),
        accent: {
          DEFAULT: ch("--accent"),
          quiet: ch("--accent-quiet"),
          ink: ch("--accent-ink"),
          fill: ch("--accent-fill"),
        },

        /* Hairlines carry a baked alpha, so they cannot also take an opacity modifier.
           That is a discipline, not a loss: a hairline has one weight. */
        line: "var(--edge)",
        "line-soft": "var(--edge-soft)",
        "line-strong": "var(--edge-strong)",

        /* ---- Absolute ramps. For art, gradients, and anything that must NOT flip. ---- */
        iris: {
          50: ch("--iris-50"),
          100: ch("--iris-100"),
          200: ch("--iris-200"),
          300: ch("--iris-300"),
          400: ch("--iris-400"),
          500: ch("--iris-500"),
          600: ch("--iris-600"),
          700: ch("--iris-700"),
          800: ch("--iris-800"),
          900: ch("--iris-900"),
        },
        blossom: {
          50: ch("--blossom-50"),
          100: ch("--blossom-100"),
          200: ch("--blossom-200"),
          300: ch("--blossom-300"),
          400: ch("--blossom-400"),
          500: ch("--blossom-500"),
          600: ch("--blossom-600"),
          700: ch("--blossom-700"),
        },
        night: {
          DEFAULT: ch("--night"),
          1: ch("--night-1"),
          2: ch("--night-2"),
          3: ch("--night-3"),
          4: ch("--night-4"),
          text: ch("--night-text"),
          muted: ch("--night-muted"),
          faint: ch("--night-faint"),
        },
        /* Direction. Persimmon rather than a true red, so a falling number can never be
           mistaken for a blossom. */
        up: { DEFAULT: ch("--up"), bright: ch("--up-bright") },
        down: { DEFAULT: ch("--down"), bright: ch("--down-bright") },
        vermilion: ch("--vermilion"),

        /* ------------------------------------------------------------------ */
        /* Compatibility shims.                                                */
        /*                                                                     */
        /* The dApp and the docs — some 3,400 lines — are written almost        */
        /* entirely in these token names. Pointing them at the new ramps        */
        /* re-skins every one of those screens without editing a single page    */
        /* file, which is what lets the rebrand land in reviewable pieces       */
        /* instead of one unreadable commit. They are renamed away, and this    */
        /* block deleted, in the final pass; a green build after that deletion  */
        /* is the proof that nothing was left behind.                          */
        /* ------------------------------------------------------------------ */
        cyan: {
          DEFAULT: ch("--iris-500"),
          bright: ch("--iris-300"),
          dark: ch("--iris-600"),
          deep: ch("--iris-700"),
          soft: "rgb(var(--iris-500) / 0.10)",
        },
        panel: {
          DEFAULT: ch("--night-2"),
          2: ch("--night-3"),
          3: ch("--night-4"),
          text: ch("--night-text"),
          muted: ch("--night-muted"),
          faint: ch("--night-faint"),
          line: "var(--night-edge-soft)",
          edge: "var(--night-edge)",
        },
      },

      fontFamily: {
        /* Archivo is the only grotesque on the shelf with both a true 900 and a width
           axis, which is what lets a 96px headline and a condensed table header come
           from one family instead of two. */
        display: ["Archivo", "Helvetica Neue", "Helvetica", "Arial", "sans-serif"],
        sans: ["Instrument Sans", "Helvetica Neue", "Helvetica", "Arial", "sans-serif"],
        /* Newsreader is optically sized, so it stays crisp at a 12px eyebrow and turns
           elegant at a 30px pull quote without a second cut. */
        serif: ["Newsreader", "Iowan Old Style", "Georgia", "Times New Roman", "serif"],
        mono: ["IBM Plex Mono", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
        /* Alias kept so `.kicker` and the docs keep resolving during the rename pass. */
        editorial: ["Newsreader", "Iowan Old Style", "Georgia", "serif"],
      },

      letterSpacing: {
        cut: "-0.04em",
        tightest: "-0.032em",
        tighter: "-0.02em",
        wide: "0.08em",
        widest: "0.18em",
        mega: "0.24em",
      },

      fontSize: {
        /* Machine labels. Small, tracked out, always uppercase. */
        nano: ["9px", { lineHeight: "1.1", letterSpacing: "0.2em" }],
        micro: ["10px", { lineHeight: "1.2", letterSpacing: "0.16em" }],
        label: ["11px", { lineHeight: "1.3", letterSpacing: "0.12em" }],
        /* Display, set in a grotesque. A grotesque wants tighter leading and tracking
           than the didone this system used to run on — the old values leave holes. */
        colossal: ["clamp(64px, 12vw, 190px)", { lineHeight: "0.82", letterSpacing: "-0.04em" }],
        hero: ["clamp(48px, 6.5vw, 96px)", { lineHeight: "0.95", letterSpacing: "-0.032em" }],
        display: ["clamp(34px, 4.4vw, 64px)", { lineHeight: "1.0", letterSpacing: "-0.025em" }],
        headline: ["clamp(26px, 3.2vw, 42px)", { lineHeight: "1.08", letterSpacing: "-0.02em" }],
        title: ["clamp(19px, 1.8vw, 25px)", { lineHeight: "1.2", letterSpacing: "-0.012em" }],
      },

      maxWidth: { shell: "1440px", prose: "62ch" },
      spacing: {
        gut: "clamp(20px, 4vw, 56px)",
        band: "clamp(76px, 10vw, 152px)",
      },

      transitionTimingFunction: {
        /* The house curve. Everything decelerates; nothing bounces. */
        osk: "cubic-bezier(0.16, 1, 0.3, 1)",
        swift: "cubic-bezier(0.4, 0, 0.2, 1)",
      },

      boxShadow: {
        /* Light falls from above, and it is faintly violet, because everything on this
           page is lit by the same bloom. */
        lift: "0 1px 2px rgb(22 14 34 / 0.04), 0 8px 24px -12px rgb(22 14 34 / 0.12)",
        float: "0 1px 2px rgb(22 14 34 / 0.05), 0 24px 60px -24px rgb(22 14 34 / 0.24)",
        panel: "0 1px 0 0 rgb(255 255 255 / 0.06) inset, 0 18px 44px -28px rgb(10 5 16 / 0.5)",
        glow: "0 0 0 1px rgb(var(--iris-500) / 0.45), 0 0 30px -6px rgb(var(--iris-500) / 0.4)",
      },

      zIndex: { chrome: "60", veil: "70" },
    },
  },
  plugins: [],
};

export default config;
