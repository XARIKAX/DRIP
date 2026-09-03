"use client";

import Link from "next/link";
import { CountUp, Reveal } from "@/components/motion";
import { DashboardPreview } from "@/components/DashboardPreview";
import { Folio } from "@/components/site/Folio";

const NUMBERS = [
  { value: 80, unit: "%", label: "Most of the pool that can ever be lent out", note: "Written into the code" },
  { value: 40, unit: "%", label: "Most you can borrow against your stock", note: "A loan is closed out at 65" },
  { value: 1, unit: "%", label: "The only fee, for getting paid early", note: "Goes to the pool" },
  { value: 0, unit: "", label: "Days between getting paid and buying more", note: "Same transaction" },
];

/**
 * The demonstration.
 *
 * A landing page that describes a product is a brochure; one that runs it is a
 * demonstration. The frame on the right is the live dashboard, bound to the same
 * portfolio the app opens on — the counters below the fold were already ticking
 * before you arrived.
 */
export function Live() {
  return (
    <section id="live" className="relative py-band">
      {/* Engineering paper, fading out toward the edges so it reads as a ground and
          not as a pattern laid over the section. */}
      <div className="pointer-events-none absolute inset-0 grid-bg grid-fade opacity-40" aria-hidden />

      <Reveal className="shell relative">
        <Folio serial="The real thing, running" index={5} />
        <div className="mt-12 grid items-center gap-14 lg:grid-cols-12 lg:gap-14">
          <div className="min-w-0 lg:col-span-4">
            <h2 className="reveal reveal-1 display text-display">
              This is not a picture
            </h2>
            <p className="reveal reveal-2 mt-7 max-w-md text-[16px] leading-[1.7] text-muted">
              The panel next to this is the live app, running on a sample portfolio. The
              numbers are moving while you read. You do not need a wallet to try any of it.
              Connect one only when you want the numbers to be yours.
            </p>
            <div className="reveal reveal-3 mt-9 flex flex-wrap gap-3">
              <Link href="/app" className="btn-primary">
                Open the app
              </Link>
              <Link href="/app/calendar" className="btn-quiet">
                Payout calendar
              </Link>
            </div>
          </div>

          <div className="reveal reveal-2 min-w-0 lg:col-span-8">
            <DashboardPreview />
          </div>
        </div>

        {/* The numbers band. Four figures, each one a rule in a contract. */}
        <div className="mt-band">
          <div className="rule rule-draw" />
          <div className="grid gap-10 pt-12 lg:grid-cols-12">
            <div className="reveal min-w-0 lg:col-span-3">
              <div className="serial">The numbers</div>
              <p className="kicker mt-4 max-w-xs">
                Every number here is written into the code. Nobody can change it on a whim.
              </p>
            </div>

            <div className="grid min-w-0 grid-cols-2 gap-x-8 gap-y-12 lg:col-span-9 lg:grid-cols-4">
              {NUMBERS.map((n, i) => (
                <div key={n.label} className={`reveal reveal-${i + 1} min-w-0`}>
                  <div className="flex items-baseline">
                    <span className="figure text-[clamp(44px,5.5vw,76px)] leading-[0.85] text-ink">
                      <CountUp to={n.value} />
                    </span>
                    <span className="figure text-[clamp(20px,2.4vw,30px)] leading-none text-cyan-dark">
                      {n.unit}
                    </span>
                  </div>
                  <div className="mt-5 border-t border-line-soft pt-4">
                    <div className="text-[13px] font-semibold leading-snug text-ink">
                      {n.label}
                    </div>
                    <div className="mt-1.5 font-mono text-nano uppercase text-ghost">{n.note}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
