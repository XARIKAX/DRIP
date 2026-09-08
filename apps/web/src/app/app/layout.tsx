import type { ReactNode } from "react";
import { UtilityBar } from "@/components/UtilityBar";
import { SiteNav } from "@/components/SiteNav";
import { TickerStrip } from "@/components/TickerStrip";
import { Footer } from "@/components/Footer";
import { GroundLine } from "@/components/pixel/Scenery";

/**
 * The app shell. Status rail, nav, tape, page, footer — identical on every screen, so
 * moving between surfaces never feels like moving between products. The grain sits on
 * the shell rather than the page so it survives every route change, and it is doing
 * real work: it is the dither that keeps the violet grounds from banding.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grain relative min-h-screen bg-ground">
      <UtilityBar />
      <SiteNav />
      <TickerStrip />
      <main className="shell relative z-[2] py-12 md:py-16">{children}</main>
      {/* The horizon the app stands on, between the last panel and the night footer. */}
      <div className="relative z-[2] overflow-hidden opacity-40 [--cell:2px]" aria-hidden>
        <GroundLine cell="calc(var(--cell) * 2)" className="w-full" />
      </div>
      <Footer />
    </div>
  );
}
