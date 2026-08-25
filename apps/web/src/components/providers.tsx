"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/Wordmark";

/**
 * Client only boundary for the whole app.
 *
 * The wallet provider stack is loaded with ssr:false, so nothing from wagmi,
 * RainbowKit or react-query renders during the build's static export. Pages
 * prerender as this shell and boot fully in the browser. A dapp's real content is
 * wallet and RPC state anyway; there is nothing meaningful to prerender behind it.
 */
const WalletProviders = dynamic(() => import("@/components/WalletProviders"), {
  ssr: false,
  loading: () => <BootShell />,
});

/** What the static HTML contains: the lockup, centered, until the app hydrates. */
function BootShell() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <Wordmark size="lg" />
    </div>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return <WalletProviders>{children}</WalletProviders>;
}
