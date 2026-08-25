import { defineChain } from "viem";
import { arbitrumSepolia, foundry } from "viem/chains";

/**
 * Robinhood Chain testnet: chain id 46630, an Arbitrum Orbit L2 with ETH gas.
 *
 * The public testnet launched in February 2026. The public RPC below is rate
 * limited; override NEXT_PUBLIC_RPC_URL with an Alchemy Robinhood testnet endpoint
 * for anything beyond a demo. Arbitrum Sepolia remains a faithful development
 * stand in (Orbit chains are Arbitrum Nitro under the hood), and everything in
 * this repo runs against either unchanged.
 */
export const robinhoodTestnet = defineChain({
  id: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 46630),
  name: process.env.NEXT_PUBLIC_CHAIN_NAME ?? "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_URL ?? "https://rpc.testnet.chain.robinhood.com/rpc"],
    },
  },
  blockExplorers: {
    default: {
      name: process.env.NEXT_PUBLIC_EXPLORER_NAME ?? "Robinhood Chain Explorer",
      url: process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://explorer.testnet.chain.robinhood.com",
    },
  },
  testnet: true,
});

/** Chains the app knows how to talk to. */
export const supportedChains = [foundry, arbitrumSepolia, robinhoodTestnet] as const;

export { arbitrumSepolia, foundry };
