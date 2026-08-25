"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, getDefaultConfig, lightTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { useState, type ReactNode } from "react";
import { activeChain, transport, walletConnectProjectId } from "@/lib/chain.config";

/**
 * Wallet, cache and chain config.
 *
 * RainbowKit is themed down to the same rules as the rest of the product: square
 * corners, black outlines, one cyan accent.
 */
const wagmiConfig = getDefaultConfig({
  appName: "DRIP",
  // RainbowKit requires a string here. Without a real id WalletConnect is unavailable
  // and injected wallets still work, which is all the testnet demo needs.
  projectId: walletConnectProjectId || "drip-testnet-local",
  chains: [activeChain],
  transports: { [activeChain.id]: transport },
  ssr: true,
});

const rainbowTheme = lightTheme({
  accentColor: "#35C2DB",
  accentColorForeground: "#0A0A0A",
  borderRadius: "none",
  fontStack: "system",
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // The dashboard polls; the counters interpolate between polls.
            refetchInterval: 8_000,
            staleTime: 4_000,
            retry: 1,
          },
        },
      })
  );

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={rainbowTheme} modalSize="compact">
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
