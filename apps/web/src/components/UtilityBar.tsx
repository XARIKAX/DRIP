"use client";

import { useEffect, useState } from "react";
import { activeChain, TESTNET_NOTICE } from "@/lib/chain.config";

/**
 * The status rail. 28px, mono, and never says anything it does not know: where you
 * are, what the network is, and the time in UTC. An institutional product tells you
 * its own state before it asks for yours.
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
    <div className="relative z-chrome border-b border-line-soft bg-void-deep">
      <div className="shell flex h-8 items-center justify-between font-mono text-nano font-medium uppercase text-faint">
        <div className="flex items-center gap-2.5">
          <span className="beacon" aria-hidden />
          <span className="text-dim">{TESTNET_NOTICE}</span>
        </div>
        <div className="flex items-center gap-5 sm:gap-8">
          <span className="hidden sm:inline">{activeChain.name}</span>
          <span className="hidden md:inline">Chain {activeChain.id}</span>
          <span className="num tracking-widest text-dim">{now || "--:--:--"} UTC</span>
        </div>
      </div>
    </div>
  );
}
