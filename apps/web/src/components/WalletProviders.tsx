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
  // and injected wallets still work, which is all a local build needs.
  projectId: walletConnectProjectId || "osinko-local",
  chains: [activeChain],
  transports: { [activeChain.id]: transport },
  ssr: false,
});

/**
 * The connect modal has to belong to the same product as the page behind it.
 *
 * RainbowKit is a second design system with its own colour object, and none of the
 * work in `globals.css` reaches it — so the palette is restated here by hand. The
 * radius matters as much as the colour: a square-cornered wallet modal over a product
 * where every corner is soft is the loudest possible tell of a rebrand that was only
 * half done.
 */
const rainbowTheme = {
  ...lightTheme({
    accentColor: "#6320D6",
    accentColorForeground: "#FFFFFF",
    borderRadius: "large",
    fontStack: "system",
  }),
};

rainbowTheme.colors.modalBackground = "#FFFFFF";
rainbowTheme.colors.modalBorder = "rgba(22,14,34,0.10)";
rainbowTheme.colors.profileForeground = "#F6F4FB";
rainbowTheme.colors.connectButtonBackground = "#E4D6FF";
rainbowTheme.colors.connectButtonInnerBackground = "#E4D6FF";
rainbowTheme.colors.connectButtonText = "#160E22";
rainbowTheme.fonts.body = "Instrument Sans, Helvetica Neue, Helvetica, Arial, sans-serif";
rainbowTheme.colors.modalText = "#160E22";
rainbowTheme.colors.modalTextSecondary = "#5B4E72";
rainbowTheme.colors.actionButtonBorder = "rgba(22,14,34,0.10)";
rainbowTheme.colors.closeButtonBackground = "#EFEBF7";

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
