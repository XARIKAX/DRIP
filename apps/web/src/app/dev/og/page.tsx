import { Mark } from "@/components/Wordmark";
import { SakuraTree, StoneLantern, Stone } from "@/components/pixel/Scenery";

export const metadata = { title: "OG card", robots: { index: false, follow: false } };

/**
 * The social card, as a page.
 *
 * Rendered at exactly 1200x630 and photographed by `scripts/capture-shots.mjs` into
 * `src/app/opengraph-image.png`, which Next then serves by file convention.
 *
 * Built this way rather than with `next/og` for one blunt reason: satori cannot read
 * WOFF2, and every face on this site is WOFF2. Photographing the real page also means
 * the card is set in the same type, lit by the same gradients and grown from the same
 * sprites as the site it links to — it cannot drift, because there is nothing separate
 * to drift from.
 */
export default function OgCard() {
  return (
    <div className="flex min-h-screen items-start justify-start bg-ground-3 p-0">
      <div
        data-shot="og"
        className="night grain-local relative flex flex-col justify-between overflow-hidden bg-night [--cell:3px]"
        style={{ width: 1200, height: 630 }}
      >
        {/* The card is one crop of the hero — its violet half — rather than the whole
            descent. A social card is read at thumbnail size, and a gradient that spends
            its first third on near-white spends it on nothing. */}
        <div
          className="absolute inset-0"
          aria-hidden
          style={{
            background:
              "linear-gradient(158deg, #3a1470 0%, #7b2ff7 26%, #4a1a8f 52%, #1a0c2e 82%, #0a0510 100%)",
          }}
        />
        <div
          className="absolute inset-0"
          aria-hidden
          style={{
            background:
              "radial-gradient(46% 62% at 74% 34%, rgb(174 126 255 / 0.55) 0%, rgb(123 47 247 / 0) 72%)",
          }}
        />

        <div className="pointer-events-none absolute -bottom-2 right-[2%] opacity-90" aria-hidden>
          <SakuraTree seed={0} cell="calc(var(--cell) * 1.15)" />
        </div>
        <div className="pointer-events-none absolute -bottom-2 right-[26%] opacity-60" aria-hidden>
          <SakuraTree seed={1} cell="calc(var(--cell) * 0.8)" />
        </div>
        <div className="pointer-events-none absolute bottom-0 right-[23%]" aria-hidden>
          <StoneLantern cell="calc(var(--cell) * 0.75)" />
        </div>
        <div className="pointer-events-none absolute bottom-0 right-[18%]" aria-hidden>
          <Stone size={1} cell="calc(var(--cell) * 0.9)" />
        </div>

        <div className="relative px-16 pt-14">
          <span className="inline-flex items-center gap-3 text-ink">
            <Mark size={40} />
            <span className="display text-[34px] leading-none" style={{ letterSpacing: "-0.02em" }}>
              Osinko
            </span>
          </span>
        </div>

        <div className="relative px-16 pb-20">
          <p className="eyebrow" style={{ color: "rgb(203 176 255)" }}>
            Split, borrow, and earn with your stocks
          </p>
          <h1 className="display mt-6 max-w-[15ch] text-[80px] leading-[0.94] text-ink">
            The On-Chain
            <br />
            Dividend Engine
          </h1>
        </div>
      </div>
    </div>
  );
}
