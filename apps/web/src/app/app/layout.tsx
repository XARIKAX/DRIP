import type { ReactNode } from "react";
import { UtilityBar } from "@/components/UtilityBar";
import { SiteNav } from "@/components/SiteNav";
import { TickerStrip } from "@/components/TickerStrip";
import { Footer } from "@/components/Footer";

/**
 * The app shell. Status rail, nav, tape, page, footer — identical on every screen, so
 * moving between surfaces never feels like moving between products. The grain sits on
 * the shell rather than the page so it survives every route change.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grain relative min-h-screen bg-paper">
      <UtilityBar />
      <SiteNav />
      <TickerStrip />
      <main className="shell relative z-[2] py-12 md:py-16">{children}</main>
      <Footer />
    </div>
  );
}
