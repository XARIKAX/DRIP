"use client";

import { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useDataSource } from "@/lib/data/provider";

/**
 * The demo notice. Slim, dismissible, never a modal, never blocking.
 * Connecting swaps the data source; it does not unlock anything.
 */
export function DemoBanner() {
  const source = useDataSource();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem("drip-demo-banner") === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (source !== "demo" || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem("drip-demo-banner", "1");
    } catch {
      // storage denied: the banner simply returns next visit
    }
  };

  return (
    <div className="hairline-b bg-wash">
      <div className="shell flex items-center justify-between gap-4 py-2.5">
        <p className="text-[13px]">
          <span className="mr-2 inline-block h-2 w-2 bg-cyan align-middle" aria-hidden />
          Viewing the demo portfolio. Connect to use your own.
        </p>
        <div className="flex shrink-0 items-center gap-3">
          <ConnectButton.Custom>
            {({ openConnectModal }) => (
              <button type="button" onClick={openConnectModal} className="text-micro font-bold uppercase underline decoration-cyan decoration-2 underline-offset-4">
                Connect
              </button>
            )}
          </ConnectButton.Custom>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss demo notice"
            className="px-1 text-[16px] leading-none text-muted hover:text-ink"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
