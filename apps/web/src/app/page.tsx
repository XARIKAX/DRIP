import { ReadProgress } from "@/components/motion";
import { LandingNav } from "@/components/site/LandingNav";
import { UtilityBar } from "@/components/UtilityBar";
import { TickerStrip } from "@/components/TickerStrip";
import { Hero } from "@/components/site/Hero";
import { Mechanism } from "@/components/site/Mechanism";
import { Modules } from "@/components/site/Modules";
import { Universe } from "@/components/site/Universe";
import { Live } from "@/components/site/Live";
import { Thesis, Closing } from "@/components/site/Thesis";
import { Footer } from "@/components/Footer";

/**
 * The landing page.
 *
 * Seven movements, in the order an argument is actually made: the claim, the mechanism
 * that backs it, the surfaces that implement it, the universe it covers, proof that it
 * is already running, the reasoning underneath, and one thing to do about it.
 */
export default function HomePage() {
  return (
    <div className="grain relative min-h-screen bg-paper">
      <ReadProgress />
      <UtilityBar />
      <LandingNav />
      <TickerStrip />

      <main className="relative z-[2]">
        <Hero />
        <Mechanism />
        <Modules />
        <Universe />
        <Live />
        <Thesis />
        <Closing />
      </main>

      <Footer />
    </div>
  );
}
