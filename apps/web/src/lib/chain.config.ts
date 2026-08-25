import { defineChain, http, type Chain } from "viem";
import { arbitrumSepolia, foundry } from "viem/chains";
import { getDeployment, knownChainIds } from "@drip/sdk";

/**
 * The one file that knows about the network.
 *
 * Everything else in the app imports from here. When Robinhood Chain testnet access
 * lands, set the env vars in .env.local and nothing else moves: same chain id lookup,
 * same address book, same ABIs.
 */

const envChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 31337);
const envRpc = process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545";
const envName = process.env.NEXT_PUBLIC_CHAIN_NAME ?? "Anvil";
const explorerName = process.env.NEXT_PUBLIC_EXPLORER_NAME ?? "Explorer";
const explorerUrl = process.env.NEXT_PUBLIC_EXPLORER_URL ?? "";

/** Known viem chains, so a standard testnet keeps its proper metadata. */
const BUILT_IN: Record<number, Chain> = {
  [foundry.id]: { ...foundry, rpcUrls: { default: { http: [envRpc] } } },
  [arbitrumSepolia.id]: arbitrumSepolia,
};

/** The chain this build talks to. */
export const activeChain: Chain =
  BUILT_IN[envChainId] ??
  defineChain({
    id: envChainId,
    name: envName,
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [envRpc] } },
    blockExplorers: explorerUrl ? { default: { name: explorerName, url: explorerUrl } } : undefined,
    testnet: true,
  });

export const chainId = activeChain.id;
export const transport = http(envRpc);

/** WalletConnect is optional. Injected wallets work without a project id. */
export const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

/** True when the deploy script has written an address book for this chain. */
export const isDeployed = knownChainIds().includes(chainId);

/** Address book for the active chain, or null when nothing is deployed yet. */
export function deploymentOrNull() {
  try {
    return getDeployment(chainId);
  } catch {
    return null;
  }
}

/** Link out to a block explorer, when there is one. */
export function explorerTx(hash: string): string | null {
  if (!explorerUrl) return null;
  return `${explorerUrl}/tx/${hash}`;
}

export function explorerAddress(address: string): string | null {
  if (!explorerUrl) return null;
  return `${explorerUrl}/address/${address}`;
}

/** Always visible. Nothing here is worth anything. */
export const TESTNET_NOTICE = "Testnet — tokens have no value";
