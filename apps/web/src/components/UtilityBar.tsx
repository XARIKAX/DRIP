"use client";

import { useEffect, useState } from "react";
import { activeChain, TESTNET_NOTICE } from "@/lib/chain.config";

/**
 * The status rail. Black, 30px, mono, and it never says anything it does not know:
 * where you are, what the network is, and the time in UTC. An institutional product
 * states its own condition before it asks for yours.
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
    <div className="relative z-chrome bg-ink text-paper">
      <div className="shell flex h-[30px] items-center justify-between font-mono text-nano font-medium uppercase">
        <div className="flex items-center gap-2.5">
          <span className="beacon beacon-bright" aria-hidden />
          <span className="text-paper/80">{TESTNET_NOTICE}</span>
        </div>
        <div className="flex items-center gap-5 text-paper/55 sm:gap-8">
          <span className="hidden sm:inline">{activeChain.name}</span>
          <span className="hidden md:inline">Chain {activeChain.id}</span>
          <span className="num tracking-widest text-paper/80">{now || "--:--:--"} UTC</span>
        </div>
      </div>
    </div>
  );
}
