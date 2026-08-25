import { defineChain } from "viem";
import { arbitrumSepolia, foundry } from "viem/chains";

/**
 * Robinhood Chain testnet, as an Arbitrum Orbit L2.
 *
 * Orbit chains are Arbitrum Nitro under the hood, so Arbitrum Sepolia is a faithful
 * stand in: same EVM version, same precompiles, same gas semantics, same block time
 * characteristics. Everything in this repo runs against it unchanged.
 *
 * When Robinhood Chain testnet access lands, set the two env vars below and nothing
 * else in the codebase moves.
 */
export const robinhoodTestnet = defineChain({
  id: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 421614),
  name: process.env.NEXT_PUBLIC_CHAIN_NAME ?? "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_URL ?? "https://sepolia-rollup.arbitrum.io/rpc"],
    },
  },
  blockExplorers: {
    default: {
      name: process.env.NEXT_PUBLIC_EXPLORER_NAME ?? "Arbiscan",
      url: process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://sepolia.arbiscan.io",
    },
  },
  testnet: true,
});

/** Chains the app knows how to talk to. */
export const supportedChains = [foundry, arbitrumSepolia, robinhoodTestnet] as const;

export { arbitrumSepolia, foundry };
