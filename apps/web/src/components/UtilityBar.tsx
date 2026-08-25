"use client";

import { useEffect, useState } from "react";
import { activeChain, TESTNET_NOTICE } from "@/lib/chain.config";

/**
 * The black utility bar. Always on, always says the same two things: this is a
 * testnet, and here is the clock. Institutional products tell you where you are.
 */
export function UtilityBar() {
  const [now, setNow] = useState<string>("");

  useEffect(() => {
    const tick = () =>
      setNow(
        new Date().toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="bg-ink text-paper">
      <div className="shell flex h-9 items-center justify-between text-micro font-bold uppercase">
        <div className="flex items-center gap-3">
          <span className="inline-block h-2 w-2 bg-cyan" aria-hidden />
          <span>{TESTNET_NOTICE}</span>
        </div>
        <div className="hidden items-center gap-6 sm:flex">
          <span>{activeChain.name}</span>
          <span className="num tracking-widest">{now || "--:--:--"}</span>
        </div>
      </div>
    </div>
  );
}
