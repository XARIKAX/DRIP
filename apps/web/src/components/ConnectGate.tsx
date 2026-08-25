"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { useEffect, useState, type ReactNode } from "react";
import { Empty, ErrorNote } from "@/components/ui";
import { isDeployed, activeChain } from "@/lib/chain.config";

/**
 * Two things must be true before any app page can render: a wallet is connected, and
 * this chain actually has a deployment. Say which one is missing rather than showing
 * an empty dashboard.
 */
export function ConnectGate({ children }: { children: ReactNode }) {
  const { isConnected } = useAccount();
  const [mounted, setMounted] = useState(false);

  // Wallet state is client only. Rendering it during hydration causes a mismatch.
  useEffect(() => setMounted(true), []);

  if (!isDeployed) {
    return (
      <ErrorNote
        message={`No DRIP deployment found for ${activeChain.name} (chain ${activeChain.id}). Run scripts/deploy-local.sh, then pnpm abis, then restart the dev server.`}
      />
    );
  }

  if (!mounted) return null;

  if (!isConnected) {
    return (
      <Empty
        title="Connect a wallet"
        body="Everything here is read from the chain against your address. Nothing is stored anywhere else."
        action={<ConnectButton />}
      />
    );
  }

  return <>{children}</>;
}
