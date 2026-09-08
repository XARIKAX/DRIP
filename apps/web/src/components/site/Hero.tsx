"use client";

import Image from "next/image";
import { GhostWordmark } from "@/components/Wordmark";
import { MaskLine, Reveal, useParallax, useViewportScroll } from "@/components/motion";
import { PetalField } from "@/components/pixel/Petals";
import { SakuraTree, Stone, StoneLantern } from "@/components/pixel/Scenery";
import { HeroNav } from "@/components/site/HeroNav";

/**
 * The hero.
 *
 * One plate, inset from the page and bordered with a hairline that runs blossom into
 * iris, holding a single lit object under a two-line claim. Everything else is
 * atmosphere: a sky that falls from a lavender dawn to a violet midnight across one
 * screen, a bloom behind the coin that breathes, a garden growing in at both lower
 * corners, and the name at the bottom, too large to fit and cropped by the frame.
 *
 * The composition is the argument. A dividend is a thing you are handed; so the page
 * opens on a thing being handed to you, and the only instruction on the screen is in
 * the corner where a person looks last.
 */
export function Hero() {
  const t = useViewportScroll();
  const hand = useParallax<HTMLDivElement>(10);

  return (
    <section className="relative isolate p-[9px] md:p-[13px]">
      {/* The plate. `svh` rather than `vh`: mobile browser chrome makes `vh` overshoot,
          and the one thing that must never be pushed off screen is the frame's own
          bottom edge. */}
      <div className="grain-local relative flex h-[calc(100svh-18px)] min-h-[620px] flex-col overflow-hidden rounded-2xl md:h-[calc(100svh-26px)] [--cell:2px] sm:[--cell:3px] xl:[--cell:4px]">
        {/* The sky, in three layers rather than one impossible gradient: the fall from
            dawn to midnight, the bloom the coin sits in, and the light coming in over
            the top-left shoulder. */}
        <div className="hero-sky absolute inset-0" aria-hidden />
        <div className="hero-bloom breathe absolute inset-0" aria-hidden />
        <div className="hero-dawn absolute inset-0" aria-hidden />
        <div className="hero-floor absolute inset-0" aria-hidden />

        {/* The garden. Two trees at the corners the reference gives to flowers, drawn
            crisp and stood in soft light rather than blurred — a blurred sprite is just
            a bad photograph of pixel art. They sit in a `.night` context so the bark
            darkens and the blossom gains the luminance it needs against a violet sky. */}
        {/*
         * The grove.
         *
         * Two ranks a side: a near tree at full cell and a far one at three quarters,
         * dimmed and set higher, which is the cheapest honest depth cue there is. The
         * reference puts a soft field of flowers in these corners; this is that field,
         * with every petal on the grid.
         */}
        <div
          className="night pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-[52%] select-none"
          aria-hidden
          style={{ transform: `translate3d(0, ${t * -22}px, 0)` }}
        >
          <div className="absolute bottom-[7%] left-[7%] hidden opacity-55 sm:block">
            <SakuraTree seed={1} cell="calc(var(--cell) * 0.62)" />
          </div>
          <div className="absolute bottom-0 left-[-3%] sm:left-0">
            <div className="absolute inset-0 -m-14 rounded-full bg-[radial-gradient(closest-side,rgb(255_187_211_/_0.2),transparent)]" />
            <SakuraTree seed={0} cell="calc(var(--cell) * 0.86)" className="relative" />
          </div>
          <div className="absolute bottom-0 left-[19%] hidden md:block">
            <StoneLantern cell="calc(var(--cell) * 0.8)" />
          </div>
          <div className="absolute bottom-0 left-[14%] hidden sm:block">
            <Stone size={1} cell="calc(var(--cell) * 0.8)" />
          </div>
        </div>

        <div
          className="night pointer-events-none absolute inset-x-0 bottom-0 z-[2] h-[52%] select-none"
          aria-hidden
          style={{ transform: `translate3d(0, ${t * -34}px, 0)` }}
        >
          <div className="absolute bottom-[9%] right-[8%] hidden opacity-50 lg:block">
            <SakuraTree seed={4} cell="calc(var(--cell) * 0.6)" />
          </div>
          <div className="absolute bottom-0 right-[-4%] sm:right-0">
            <div className="absolute inset-0 -m-14 rounded-full bg-[radial-gradient(closest-side,rgb(255_187_211_/_0.18),transparent)]" />
            <SakuraTree seed={1} cell="calc(var(--cell) * 0.9)" className="relative" />
          </div>
          <div className="absolute bottom-[3%] right-[23%] hidden xl:block">
            <Stone size={1} cell="calc(var(--cell) * 0.8)" />
          </div>
        </div>

        <PetalField className="petal-mask absolute inset-0 z-[3]" density={1.6} cell={4} />

        {/* The name, too large for the plate on purpose. */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-[10vw] overflow-hidden text-night-2"
          aria-hidden
          style={{ transform: `translate3d(0, ${t * 22}px, 0)` }}
        >
          <GhostWordmark style={{ transform: "translateY(7%)" }} />
        </div>

        <HeroNav />

        <Reveal className="relative z-10 flex min-h-0 flex-1 flex-col items-center px-5 pt-[5vh] text-center md:pt-[6vh]">
          <p className="eyebrow-pill reveal">Split, borrow, and earn with your stocks</p>

          <h1 className="display mt-7 max-w-[15ch] text-hero text-ink md:mt-9">
            <MaskLine>
              <span>The On-Chain</span>
            </MaskLine>
            <MaskLine>
              <span>Dividend Engine</span>
            </MaskLine>
          </h1>

          {/*
           * The object, overlapping the claim it illustrates and cropped by the plate.
           * `priority` so it is the largest paint rather than the thing that delays it;
           * `sizes` so a phone is never sent the desktop rendition. The intrinsic size
           * is stated exactly — a pixel off and Next scales it.
           */}
          <div
            ref={hand}
            className="parallax reveal reveal-3 relative -mt-[3vh] w-[min(122vw,660px)] shrink-0 sm:w-[min(96vw,660px)] md:-mt-[4vh] xl:w-[700px]"
          >
            <Image
              src="/hero-hand.png"
              alt=""
              width={1254}
              height={1254}
              priority
              quality={82}
              sizes="(min-width: 1280px) 700px, (min-width: 640px) 96vw, 122vw"
              className="drift block h-auto w-full select-none"
            />
          </div>
        </Reveal>

        {/* The stroke, over everything. A gradient `border-image` ignores
            `border-radius`, and the fill behind this one cannot be opaque, so the ring
            is cut out of a gradient with two composited masks. */}
        <div className="frame-gradient z-30 rounded-2xl" aria-hidden />
      </div>
    </section>
  );
}
