"use client";

import { useEffect, useState } from "react";
import { activeChain, STATUS_NOTICE } from "@/lib/chain.config";

/**
 * The status rail — the engawa, the boarded step a Japanese house keeps between the
 * garden and the room. Thirty pixels of near-black that never says anything it does not
 * know: where you are, what the network is, and the time in UTC. A product that states
 * its own condition before it asks for yours is a product that can be trusted with the
 * answer.
 */
export function UtilityBar() {
  const [now, setNow] = useState<string>("");

  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
          timeZone: "UTC",
        })
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="night relative z-chrome bg-night text-ink">
      <div className="shell flex h-[30px] items-center justify-between font-mono text-nano font-medium uppercase">
        <div className="flex items-center gap-2.5">
          <span className="beacon beacon-bright" aria-hidden />
          <span className="text-ink/80">{STATUS_NOTICE}</span>
        </div>
        <div className="flex items-center gap-5 text-faint sm:gap-8">
          <span className="hidden sm:inline">{activeChain.name}</span>
          <span className="hidden md:inline">Chain {activeChain.id}</span>
          <span className="num tracking-widest text-ink/80">{now || "--:--:--"} UTC</span>
        </div>
      </div>
    </div>
  );
}
