import type { ReactNode } from "react";
import { UtilityBar } from "@/components/UtilityBar";
import { SiteNav } from "@/components/SiteNav";
import { TickerStrip } from "@/components/TickerStrip";
import { Footer } from "@/components/Footer";
import { DemoBanner } from "@/components/DemoBanner";

/** The app shell. Utility bar, nav, ticker, page, footer. Same on every screen. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <UtilityBar />
      <SiteNav />
      <TickerStrip />
      <DemoBanner />
      <main className="shell py-10 md:py-14">{children}</main>
      <Footer />
    </div>
  );
}
