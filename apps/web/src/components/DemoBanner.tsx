"use client";

import { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useDataSource } from "@/lib/data/provider";

/**
 * The demo notice. Slim, dismissible, never a modal, never blocking.
 *
 * Connecting a wallet swaps the data source; it does not unlock anything. That is the
 * whole posture of the product and this is the one line that states it.
 */
export function DemoBanner() {
  const source = useDataSource();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem("osinko-demo-banner") === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (source !== "demo" || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem("osinko-demo-banner", "1");
    } catch {
      // storage denied: the banner simply returns next visit
    }
  };

  return (
    <div className="border-b border-line-soft bg-paper-2">
      <div className="shell flex items-center justify-between gap-4 py-2.5">
        <p className="flex items-center gap-3 text-[13px] text-muted">
          <span className="beacon" aria-hidden />
          Viewing the demo portfolio. Everything works — connect only to make it yours.
        </p>
        <div className="flex shrink-0 items-center gap-4">
          <ConnectButton.Custom>
            {({ openConnectModal }) => (
              <button
                type="button"
                onClick={openConnectModal}
                className="link font-mono text-nano uppercase text-cyan"
              >
                Connect
              </button>
            )}
          </ConnectButton.Custom>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss demo notice"
            className="px-1 text-[16px] leading-none text-ghost transition-colors hover:text-ink"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
