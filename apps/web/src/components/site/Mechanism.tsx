"use client";

import { remap, useScrollProgress } from "@/components/motion";

const STAGES = [
  {
    index: "01",
    title: "You hold the share.",
    body: "A position in a stock token, deposited once and held in your own custody. Nothing in this product asks you to give it up, lock it away, or sell a fraction of it to raise cash.",
    note: "Custody unchanged",
  },
  {
    index: "02",
    title: "The dividend detaches.",
    body: "At the ex date the entitlement separates from the share. The share is untouched. The claim on the cash is now a separate object the protocol can act on — weeks before a transfer agent would have moved anything.",
    note: "Ex date, not pay date",
  },
  {
    index: "03",
    title: "It becomes a flow.",
    body: "That claim stops being a quarterly lump and starts accruing every second. Take it early against the vault for one percent, or let it run and pull it whenever you want.",
    note: "One second resolution",
  },
  {
    index: "04",
    title: "It goes to work, four ways.",
    body: "Cash in hand now. A live stream you draw at will. Straight back into more of the same stock. Or against the interest on a credit line the share itself secures. One deposit, four outcomes.",
    note: "Income and credit, together",
  },
];

const ENDPOINTS = [
  { y: 104, label: "EARLY", detail: "Cash at ex, minus 1%" },
  { y: 234, label: "STREAM", detail: "Per second, drawn at will" },
  { y: 364, label: "REINVEST", detail: "Back into the position" },
  { y: 494, label: "BORROW", detail: "Services the interest" },
];

/**
 * The mechanism, told by scrolling.
 *
 * The section is four viewports tall and pins its own contents, so the page's scroll
 * becomes the transport for a single continuous animation: a share that never moves,
 * a dividend that separates from it, stretches into a stream, and forks four ways.
 * The copy changes with the diagram because they are the same argument.
 *
 * Below `lg` the scene is not pinned at all — a phone gets the four stages as an
 * ordinary list with the diagram resolved to its final state, which is honest about
 * the fact that scroll-jacking a small screen is a hostile act.
 */
export function Mechanism() {
  const { ref, progress } = useScrollProgress<HTMLDivElement>();

  return (
    // A full-bleed black band on the paper page: the section *is* the data surface,
    // which is the system's one inversion stated at the largest scale it ever gets.
    <section id="mechanism" className="panel relative border-x-0">
      {/* Pinned scene, large screens only. */}
      <div ref={ref} className="hidden lg:block lg:h-[420vh]">
        <div className="sticky top-0 flex h-screen flex-col justify-center overflow-hidden">
          <div className="pointer-events-none absolute inset-0 grid-bg-dark opacity-60" aria-hidden />
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(760px 420px at 68% 50%, rgba(53,194,219,0.10), transparent 72%)",
            }}
            aria-hidden
          />

          {/* Scene and rail are centred as one block. Pinning the rail to the floor of
              the viewport instead leaves a dead band under a composition this compact. */}
          <div className="relative flex items-center">
            <div className="shell grid w-full grid-cols-12 items-center gap-10">
              <div className="col-span-5 min-w-0">
                <StageText progress={progress} />
              </div>
              <div className="col-span-7 min-w-0">
                <Scene progress={progress} />
              </div>
            </div>
          </div>

          {/* The chapter index, held at the foot of the frame: at any moment you can see
              where in the argument you are and what is still coming. */}
          <div className="shell relative mt-16 shrink-0">
            <div className="grid grid-cols-4 border-t border-panel-line">
              {STAGES.map((s, i) => {
                const on = Math.min(Math.floor(progress * STAGES.length), STAGES.length - 1) === i;
                return (
                  <div
                    key={s.index}
                    className={`min-w-0 border-r border-panel-line px-4 py-4 last:border-r-0 transition-colors duration-500 ${
                      on ? "text-panel-text" : "text-panel-faint"
                    }`}
                  >
                    <div className="flex items-baseline gap-3">
                      <span
                        className={`num text-nano transition-colors duration-500 ${
                          on ? "text-cyan" : "text-panel-faint"
                        }`}
                      >
                        {s.index}
                      </span>
                      <span className="truncate font-mono text-nano uppercase">{s.note}</span>
                    </div>
                    <div
                      className={`mt-3 h-px origin-left bg-cyan transition-transform duration-700 ease-osk ${
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

      {/* Unpinned fallback. */}
      <div className="lg:hidden">
        <div className="shell py-20">
          <div className="serial">The mechanism</div>
          <h2 className="mt-4 display text-display text-panel-text">A share that never moves</h2>
          <div className="mt-10 -mx-2">
            <Scene progress={1} />
          </div>
          <ol className="mt-12 space-y-10">
            {STAGES.map((s) => (
              <li key={s.index} className="border-t border-panel-line pt-6">
                <div className="flex items-baseline gap-4">
                  <span className="num text-micro font-medium text-cyan">{s.index}</span>
                  <h3 className="display text-title text-panel-text">{s.title}</h3>
                </div>
                <p className="mt-3 text-[15px] leading-relaxed text-panel-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

/** The four blocks of copy, cut against the scroll position. */
function StageText({ progress }: { progress: number }) {
  const span = 1 / STAGES.length;
  const index = Math.min(Math.floor(progress / span), STAGES.length - 1);
  const active = STAGES[index];

  return (
    <div>
      <div className="serial">The mechanism</div>

      {/* Chapter marker and the track itself. */}
      <div className="mt-5 flex items-center gap-4">
        <span className="num text-[13px] font-medium text-cyan">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="relative h-px flex-1 bg-panel-line">
          <div
            className="absolute inset-y-0 left-0 bg-cyan"
            style={{ width: `${progress * 100}%` }}
            aria-hidden
          />
        </div>
        <span className="num text-[13px] font-medium text-panel-faint">/ 04</span>
      </div>

      {/* One stage at a time.
          Cross-fading two blocks of display type at the same coordinates makes both
          illegible for the length of the fade, which is worse than a clean cut — so the
          active stage is the only one mounted, and the swap is animated by remounting it. */}
      <div className="mt-9 min-h-[340px]">
        <div key={active.index} className="rise-group">
          <div>
            <h2 className="display text-display text-panel-text">{active.title}</h2>
            <p className="mt-6 max-w-lg text-[17px] leading-[1.65] text-panel-muted">{active.body}</p>
            <div className="mt-8 inline-flex items-center gap-3 border-l border-cyan pl-4">
              <span className="font-mono text-nano uppercase text-cyan">{active.note}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The diagram.
 *
 * Every geometry in here is derived from one number. The share is drawn once and never
 * transformed; the cyan is the only thing that moves, which is the point being made.
 */
function Scene({ progress: p }: { progress: number }) {
  // The dividend leaves the share and crosses to the fork.
  const chipX = remap(p, 0.16, 0.42, 276, 592);
  const chipOn = remap(p, 0.13, 0.19, 0, 1) * remap(p, 0.44, 0.5, 1, 0.35);

  // The trunk draws itself behind the travelling chip, then starts flowing.
  const trunkDraw = remap(p, 0.16, 0.44, 0, 1);
  const flowing = p > 0.42;

  // The seam on the share's edge, where the entitlement separates.
  const seam = remap(p, 0.06, 0.2, 0, 1);

  return (
    <svg
      viewBox="0 0 1040 600"
      className="h-auto w-full overflow-visible"
      role="img"
      aria-label="A share stays in place while its dividend detaches, becomes a per-second stream, and splits four ways into early cash, a stream, reinvestment, and credit."
    >
      <defs>
        <filter id="osk-glow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="7" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id="osk-trunk" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#35C2DB" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#35C2DB" stopOpacity="1" />
        </linearGradient>
      </defs>

      {/* Registration marks. The graph paper the whole thing is drawn on. */}
      <g stroke="rgba(255,255,255,0.14)" strokeWidth="1">
        {[
          [330, 130],
          [330, 470],
          [900, 60],
          [64, 540],
        ].map(([x, y]) => (
          <g key={`${x}-${y}`}>
            <line x1={x - 6} y1={y} x2={x + 6} y2={y} />
            <line x1={x} y1={y - 6} x2={x} y2={y + 6} />
          </g>
        ))}
      </g>

      {/* ---- The share. Drawn once, never transformed. ---- */}
      <g>
        <rect
          x="60"
          y="225"
          width="216"
          height="150"
          fill="#0B0E11"
          stroke="rgba(255,255,255,0.18)"
          strokeWidth="1.2"
        />
        <rect x="60" y="225" width="216" height="1.2" fill="rgba(255,255,255,0.22)" />
        <text x="84" y="266" fill="#F3F6F8" fontSize="26" fontWeight="800" letterSpacing="-1">
          AAPL
        </text>
        <text
          x="84"
          y="292"
          fill="#5A636B"
          fontSize="11"
          fontFamily="IBM Plex Mono, monospace"
          letterSpacing="1.6"
        >
          STOCK TOKEN
        </text>
        <text
          x="84"
          y="344"
          fill="#F3F6F8"
          fontSize="25"
          fontFamily="IBM Plex Mono, monospace"
          fontWeight="500"
        >
          150.0000
        </text>

        {/* The seam: the entitlement separating from the share at the ex date. */}
        <line
          x1="276"
          y1="225"
          x2="276"
          y2="375"
          stroke="#35C2DB"
          strokeWidth="2"
          opacity={seam}
          filter="url(#osk-glow)"
        />
        <text
          x="168"
          y="410"
          fill="#5A636B"
          fontSize="10.5"
          fontFamily="IBM Plex Mono, monospace"
          letterSpacing="2"
          textAnchor="middle"
        >
          STAYS PUT
        </text>
      </g>

      {/* ---- The trunk: the dividend, in transit, becoming a flow. ---- */}
      <line x1="276" y1="300" x2="600" y2="300" stroke="rgba(255,255,255,0.09)" strokeWidth="1.2" />
      <line
        x1="276"
        y1="300"
        x2="600"
        y2="300"
        stroke="url(#osk-trunk)"
        strokeWidth="2"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - trunkDraw}
      />
      {flowing ? (
        <line
          x1="276"
          y1="300"
          x2="600"
          y2="300"
          stroke="#35C2DB"
          strokeWidth="2"
          className="flow-line"
          opacity="0.85"
        />
      ) : null}

      {/* The dividend itself, crossing. */}
      <g opacity={chipOn} filter="url(#osk-glow)">
        <rect x={chipX - 15} y="291" width="30" height="18" fill="#35C2DB" />
      </g>
      <text
        x="438"
        y="272"
        fill="#5A636B"
        fontSize="10.5"
        fontFamily="IBM Plex Mono, monospace"
        letterSpacing="2"
        textAnchor="middle"
      >
        {p > 0.42 ? "$0.26 A SHARE, ACCRUING PER SECOND" : "THE DIVIDEND"}
      </text>

      {/* The fork. */}
      <circle
        cx="600"
        cy="300"
        r="4"
        fill="#35C2DB"
        opacity={remap(p, 0.4, 0.5, 0, 1)}
      />

      {/* ---- The four outcomes. ---- */}
      {ENDPOINTS.map((e, i) => {
        // The four branches resolve by ~0.86, leaving the last of the track settled
        // rather than still animating as the section releases.
        const start = 0.46 + i * 0.07;
        const draw = remap(p, start, start + 0.13, 0, 1);
        const lit = remap(p, start + 0.08, start + 0.17, 0, 1);
        const d = `M600,300 C672,300 684,${e.y} 756,${e.y}`;

        return (
          <g key={e.label}>
            <path d={d} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1.2" />
            <path
              d={d}
              fill="none"
              stroke="#35C2DB"
              strokeWidth="1.6"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - draw}
              opacity="0.9"
            />
            <g opacity={0.25 + lit * 0.75}>
              <rect
                x="756"
                y={e.y - 38}
                width="244"
                height="76"
                fill="#0B0E11"
                stroke={lit > 0.5 ? "rgba(53,194,219,0.45)" : "rgba(255,255,255,0.1)"}
                strokeWidth="1.2"
              />
              <rect x="756" y={e.y - 38} width="3" height="76" fill="#35C2DB" opacity={lit} />
              <text
                x="782"
                y={e.y - 6}
                fill="#F3F6F8"
                fontSize="15"
                fontFamily="IBM Plex Mono, monospace"
                fontWeight="500"
                letterSpacing="2.4"
              >
                {e.label}
              </text>
              <text
                x="782"
                y={e.y + 18}
                fill="#5A636B"
                fontSize="11.5"
                fontFamily="IBM Plex Mono, monospace"
              >
                {e.detail}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
