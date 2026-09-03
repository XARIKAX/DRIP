"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, getDefaultConfig, lightTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { useState, type ReactNode } from "react";
import { activeChain, transport, walletConnectProjectId } from "@/lib/chain.config";
import { DataProvider } from "@/lib/data/provider";

/**
 * The wallet, cache and chain providers.
 *
 * This module is loaded with next/dynamic and ssr:false from providers.tsx, so none
 * of it executes during prerender. That is deliberate: the wallet stack is browser
 * software, and executing it at build time is exactly what took the Vercel export
 * down. Everything in here runs on the client, after mount, where it belongs.
 */
const wagmiConfig = getDefaultConfig({
  appName: "Osinko",
  // RainbowKit requires a string here. Without a real id WalletConnect is unavailable
  // and injected wallets still work, which is all the testnet demo needs.
  projectId: walletConnectProjectId || "drip-testnet-local",
  chains: [activeChain],
  transports: { [activeChain.id]: transport },
  ssr: false,
});

/**
 * The connect modal has to belong to the same product as the page behind it: paper
 * chrome, square corners, ink type and the one cyan accent.
 */
const rainbowTheme = {
  ...lightTheme({
    accentColor: "#0A0A0A",
    accentColorForeground: "#FFFFFF",
    borderRadius: "none",
    fontStack: "system",
  }),
};

rainbowTheme.colors.modalBackground = "#FFFFFF";
rainbowTheme.colors.modalBorder = "rgba(10,10,10,0.11)";
rainbowTheme.colors.profileForeground = "#F6F7F8";
rainbowTheme.colors.connectButtonBackground = "#0A0A0A";
rainbowTheme.colors.connectButtonInnerBackground = "#0A0A0A";
rainbowTheme.colors.connectButtonText = "#FFFFFF";
rainbowTheme.fonts.body = "Archivo, Helvetica Neue, Helvetica, Arial, sans-serif";

export default function WalletProviders({ children }: { children: ReactNode }) {
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
          <DataProvider>{children}</DataProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
