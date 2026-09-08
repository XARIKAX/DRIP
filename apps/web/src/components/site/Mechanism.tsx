"use client";

import { remap, useScrollProgress, usePrefersReducedMotion } from "@/components/motion";
import { PixelSprite } from "@/components/pixel/Sprite";
import { Koi, Stone, StoneLantern } from "@/components/pixel/Scenery";
import { SAND as SAND_PALETTE } from "@/components/pixel/palette";
import { sandGrid } from "@/components/pixel/generate";
import { PALETTE, SVG_MONO } from "@/lib/palette";

const STAGES = [
  {
    index: "01",
    title: "You deposit a stock.",
    body: "It stays yours. You can take it out any time. Nobody sells it, locks it up or lends it out unless you ask. Depositing is how you tell Osinko you want your dividends handled the new way.",
    note: "Your stock, still yours",
  },
  {
    index: "02",
    title: "The dividend splits off.",
    body: "The ex date is the day you must own a stock to get its next payout. On that day, Osinko treats the payout as its own thing. The stock does not move. The money is now something the protocol can act on, weeks before the company would send it.",
    note: "Ex date, not pay date",
  },
  {
    index: "03",
    title: "You get it now.",
    body: "No three week wait. Take the whole payout today for a 1% fee. Or let it drip into your wallet a little every second, and collect it whenever you like.",
    note: "Weeks early",
  },
  {
    index: "04",
    title: "It goes to work.",
    body: "Cash today. A steady drip you collect at will. More of the same stock, bought for you as the money lands. Or a loan against your stock that the dividends pay down. One deposit, four choices.",
    note: "Income and credit",
  },
];

/** Where the four channels end, in the scene's own 1040 x 600 coordinates. */
const ENDPOINTS = [
  { y: 104, label: "EARLY", detail: "Cash today, minus 1%" },
  { y: 234, label: "STREAM", detail: "A little every second" },
  { y: 364, label: "REINVEST", detail: "Buys more of the stock" },
  { y: 494, label: "BORROW", detail: "Pays your loan interest" },
];

/** Grown once. Regenerating this inside a scroll-driven render would cost it sixty times a second. */
const SAND = sandGrid({ seed: 3, w: 132, h: 78, pitch: 5, rings: 24, focus: [30, 39] });

/**
 * The mechanism, told by scrolling — and told as a dry garden.
 *
 * The section is three viewports tall and pins its own contents, so the page's scroll
 * becomes the transport for one continuous scene. A stone is set down and never moves
 * again; the sand around it is raked outward ring by ring as you read; a koi carries the
 * payment along the channel; and four lanterns light in turn at the far end.
 *
 * The metaphor is doing work rather than decorating. A karesansui stone is, by
 * definition, the element that does not move — which is the whole claim being made
 * about the share — and rings raked around it are how a garden shows influence
 * spreading from something that stayed put. The old version drew the same argument in
 * boxes and arrows and had to caption itself.
 *
 * Two things it will not do. Below `lg` the scene is not pinned at all: a phone gets
 * the four stages as a list with the garden finished, because scroll-jacking a small
 * screen is a hostile act. And a reader who has asked for reduced motion gets that same
 * list on every screen — the old version returned a finished progress value but kept
 * four viewports of empty scroll, which is the worst of both.
 */
export function Mechanism() {
  const { ref, progress } = useScrollProgress<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();

  return (
    <section id="mechanism" className="relative bg-ground py-10 md:py-16">
      {/* Pinned scene, large screens only, and only when motion is welcome. */}
      <div ref={ref} className={reduced ? "hidden" : "hidden lg:block lg:h-[320vh]"}>
        <div className="shell sticky top-8">
          <div className="panel-frame flex h-[calc(100vh-64px)] flex-col justify-center [--cell:3px]">
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(760px 420px at 66% 52%, rgb(139 92 246 / 0.16), transparent 72%)",
              }}
              aria-hidden
            />

            <div className="relative flex items-center px-8 md:px-14">
              <div className="grid w-full grid-cols-12 items-center gap-10">
                <div className="col-span-5 min-w-0">
                  <StageText progress={progress} />
                </div>
                <div className="col-span-7 min-w-0">
                  <Scene progress={progress} />
                </div>
              </div>
            </div>

            {/* The chapter index at the foot: where in the argument you are, and what
                is still coming. */}
            <div className="relative mt-14 shrink-0 px-8 pb-2 md:px-14">
              <div className="grid grid-cols-4 border-t border-line">
                {STAGES.map((s, i) => {
                  const on = Math.min(Math.floor(progress * STAGES.length), STAGES.length - 1) === i;
                  return (
                    <div
                      key={s.index}
                      className={`min-w-0 border-r border-line px-4 py-4 last:border-r-0 transition-colors duration-500 ${
                        on ? "text-ink" : "text-faint"
                      }`}
                    >
                      <div className="flex items-baseline gap-3">
                        <span className={`num text-nano transition-colors duration-500 ${on ? "text-accent" : "text-faint"}`}>
                          {s.index}
                        </span>
                        <span className="truncate font-mono text-nano uppercase">{s.note}</span>
                      </div>
                      <div
                        className={`mt-3 h-[3px] w-full origin-left rounded-[1px] bg-accent transition-transform duration-700 ease-osk ${
                          on ? "scale-x-100" : "scale-x-0"
                        }`}
                        aria-hidden
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Laid out rather than pinned: small screens, and anyone who asked for less motion. */}
      <div className={reduced ? "block" : "lg:hidden"}>
        <div className="shell">
          <div className="panel-frame p-6 md:p-10 [--cell:2px] md:[--cell:3px]">
            <div className="eyebrow">How it works</div>
            <h2 className="mt-4 display text-display text-ink">
              Your stock never moves. Only the dividend does.
            </h2>
            <div className="mt-10">
              <Scene progress={1} />
            </div>
            <ol className="mt-12 space-y-10">
              {STAGES.map((s) => (
                <li key={s.index} className="border-t border-line pt-6">
                  <div className="flex items-baseline gap-4">
                    <span className="num text-micro font-medium text-accent">{s.index}</span>
                    <h3 className="display text-title text-ink">{s.title}</h3>
                  </div>
                  <p className="mt-3 text-[15px] leading-relaxed text-muted">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

/** The four blocks of copy, cut against the scroll position. */
function StageText({ progress }: { progress: number }) {
  const span = 1 / STAGES.length;
  const index = Math.min(Math.floor(progress / span), STAGES.length - 1);
  const active = STAGES[index]!;

  return (
    <div>
      <div className="eyebrow">How it works</div>

      <div className="mt-5 flex items-center gap-4">
        <span className="num text-[13px] font-medium text-accent">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="relative h-px flex-1 bg-line">
          <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${progress * 100}%` }} aria-hidden />
        </div>
        <span className="num text-[13px] font-medium text-faint">/ 04</span>
      </div>

      {/* One stage at a time. Cross-fading two blocks of display type at the same
          coordinates makes both illegible for the length of the fade, which is worse
          than a clean cut — so the active stage is the only one mounted, and the swap
          is animated by remounting it. */}
      <div className="mt-9 min-h-[340px]">
        <div key={active.index} className="rise-group">
          <div>
            <h2 className="display text-display text-ink">{active.title}</h2>
            <p className="mt-6 max-w-lg text-[17px] leading-[1.65] text-muted">{active.body}</p>
            <div className="mt-8 inline-flex items-center gap-3 border-l-2 border-accent pl-4">
              <span className="font-mono text-nano uppercase text-accent">{active.note}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The garden, as one number.
 *
 * Sprites sit in an absolutely positioned layer over an SVG that carries the channels
 * and the type. The two do not fight: SVG is the right tool for a line that draws
 * itself and text that has to sit on a baseline, and a sprite is the right tool for an
 * object. Everything is derived from `p`, and nothing is regenerated per frame — the
 * sand is a module constant revealed by a growing clip, which is what makes "the reader
 * rakes it" cost nothing.
 */
function Scene({ progress: p }: { progress: number }) {
  // The sand is raked outward from the stone as the argument is made.
  const rake = remap(p, 0.04, 0.5, 8, 96);
  // The koi carries the payment down the channel.
  const koiX = remap(p, 0.16, 0.44, 30, 57.5);
  const koiOn = remap(p, 0.13, 0.19, 0, 1) * remap(p, 0.46, 0.52, 1, 0.25);
  const trunkDraw = remap(p, 0.16, 0.46, 0, 1);
  const flowing = p > 0.44;
  const seam = remap(p, 0.06, 0.2, 0, 1);

  return (
    <div className="relative w-full" style={{ aspectRatio: "1040 / 600" }}>
      {/* The raked ground. Clipped to a circle that grows with the scroll, so the
          rings arrive one at a time from the stone outward. */}
      <div
        className="pointer-events-none absolute left-[-2%] top-[6%] w-[52%] opacity-[0.55]"
        style={{ clipPath: `circle(${rake}% at 23% 50%)` }}
        aria-hidden
      >
        <PixelSprite grid={SAND} palette={SAND_PALETTE} cell="calc(var(--cell) * 1.35)" />
      </div>

      <svg
        viewBox="0 0 1040 600"
        className="absolute inset-0 h-full w-full overflow-visible"
        role="img"
        aria-label="A stock stays in place while its dividend splits off, pays out every second, and goes one of four ways: cash today, a steady drip, more stock, or paying down a loan."
      >
        <defs>
          <filter id="osk-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="7" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="osk-channel" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor={PALETTE.iris[300]} stopOpacity="0.2" />
            <stop offset="100%" stopColor={PALETTE.iris[300]} stopOpacity="1" />
          </linearGradient>
        </defs>

        {/* The holding. A label, not a box — the stone beside it is the object. */}
        <g>
          <text x="150" y="252" fill={PALETTE.night.text} fontSize="36" fontWeight="800" letterSpacing="-1.4">
            AAPL
          </text>
          <text x="150" y="284" fill={PALETTE.night.faint} fontSize="14.5" fontFamily={SVG_MONO} letterSpacing="1.6">
            STOCK TOKEN
          </text>
          <text x="150" y="342" fill={PALETTE.night.text} fontSize="33" fontFamily={SVG_MONO} fontWeight="500">
            150.0000
          </text>
          <text x="150" y="556" fill={PALETTE.night.faint} fontSize="14" fontFamily={SVG_MONO} letterSpacing="2">
            STAYS PUT
          </text>

          {/* The seam: the entitlement separating at the ex date. */}
          <line
            x1="300"
            y1="228"
            x2="300"
            y2="372"
            stroke={PALETTE.iris[300]}
            strokeWidth="2"
            opacity={seam}
            filter="url(#osk-glow)"
          />
        </g>

        {/* The channel the payment runs down. */}
        <line x1="300" y1="300" x2="620" y2="300" stroke={PALETTE.night.edgeSoft} strokeWidth="1.2" />
        <line
          x1="300"
          y1="300"
          x2="620"
          y2="300"
          stroke="url(#osk-channel)"
          strokeWidth="2"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - trunkDraw}
        />
        {flowing ? (
          <line
            x1="300"
            y1="300"
            x2="620"
            y2="300"
            stroke={PALETTE.iris[300]}
            strokeWidth="2"
            className="flow-line"
            opacity="0.85"
          />
        ) : null}

        <text x="460" y="262" fill={PALETTE.night.faint} fontSize="14" fontFamily={SVG_MONO} letterSpacing="2" textAnchor="middle">
          {p > 0.44 ? "$0.26 A SHARE, PAID OUT EVERY SECOND" : "THE DIVIDEND"}
        </text>

        <circle cx="620" cy="300" r="4" fill={PALETTE.iris[300]} opacity={remap(p, 0.42, 0.52, 0, 1)} />

        {/* Four channels, four destinations. */}
        {ENDPOINTS.map((e, i) => {
          const start = 0.48 + i * 0.06;
          const draw = remap(p, start, start + 0.11, 0, 1);
          const lit = remap(p, start + 0.07, start + 0.15, 0, 1);
          const d = `M620,300 C688,300 700,${e.y} 768,${e.y}`;

          return (
            <g key={e.label}>
              <path d={d} fill="none" stroke={PALETTE.night.edgeSoft} strokeWidth="1.2" />
              <path
                d={d}
                fill="none"
                stroke={PALETTE.iris[300]}
                strokeWidth="1.6"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - draw}
                opacity="0.9"
              />
              <g opacity={0.3 + lit * 0.7}>
                <text x="836" y={e.y - 5} fill={PALETTE.night.text} fontSize="20" fontFamily={SVG_MONO} fontWeight="500" letterSpacing="2.4">
                  {e.label}
                </text>
                <text x="836" y={e.y + 24} fill={PALETTE.night.faint} fontSize="15" fontFamily={SVG_MONO}>
                  {e.detail}
                </text>
              </g>
            </g>
          );
        })}
      </svg>

      {/* The stone. Drawn once, never transformed — which is the argument. */}
      <div className="pointer-events-none absolute left-[14%] top-[70%]" aria-hidden>
        <Stone size={0} cell="calc(var(--cell) * 2.1)" />
      </div>

      {/* The payment, in transit. */}
      <div
        className="pointer-events-none absolute top-[45.5%]"
        style={{ left: `${koiX}%`, opacity: koiOn }}
        aria-hidden
      >
        <Koi swim={flowing} facing="right" cell="calc(var(--cell) * 1.5)" />
      </div>

      {/* Four lanterns, lighting in turn as their channel resolves. */}
      {ENDPOINTS.map((e, i) => {
        const start = 0.48 + i * 0.06;
        const lit = remap(p, start + 0.07, start + 0.15, 0, 1) > 0.5;
        return (
          <div
            key={e.label}
            className="pointer-events-none absolute transition-opacity duration-500"
            style={{
              left: "73.2%",
              top: `${(e.y / 600) * 100}%`,
              transform: "translateY(-50%)",
              opacity: lit ? 1 : 0.28,
            }}
            aria-hidden
          >
            <StoneLantern lit={lit} cell="calc(var(--cell) * 0.55)" />
          </div>
        );
      })}
    </div>
  );
}
