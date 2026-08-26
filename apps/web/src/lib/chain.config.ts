import { defineChain, http, type Chain } from "viem";
import { arbitrumSepolia, foundry } from "viem/chains";
import { getDeployment, knownChainIds } from "@drip-markets/sdk";

/**
 * The one file that knows about the network.
 *
 * Everything else in the app imports from here. When Robinhood Chain testnet access
 * lands, set the env vars in .env.local and nothing else moves: same chain id lookup,
 * same address book, same ABIs.
 */

/**
 * Env values arrive from dashboards where humans paste them, so every one is
 * sanitised before use. Wrapping quotes and stray whitespace in
 * NEXT_PUBLIC_CHAIN_ID once turned the chain id into NaN, which made wagmi's
 * chain lookup return undefined and took the whole app down with
 * "Cannot read properties of undefined (reading 'uid')". Never trust a pasted
 * value to be clean.
 */
function clean(value: string | undefined): string {
  if (!value) return "";
  return value.trim().replace(/^['"]+|['"]+$/g, "").trim();
}

/** Canonical public RPC per known chain, used when the env RPC is missing or invalid. */
const CANONICAL_RPC: Record<number, string> = {
  31337: "http://127.0.0.1:8545",
  4663: "https://rpc.mainnet.chain.robinhood.com",
  46630: "https://rpc.testnet.chain.robinhood.com/rpc",
  421614: "https://sepolia-rollup.arbitrum.io/rpc",
};

function parseChainId(raw: string): number {
  const parsed = Number(raw);
  if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  // A set-but-broken value means a hosted deployment was intended. Robinhood
  // Chain testnet is the product's home, so that is the sane recovery.
  return raw ? 46630 : 31337;
}

function parseRpcUrl(raw: string, chainId: number): string {
  try {
    if (raw) return new URL(raw).toString();
  } catch {
    // fall through to the canonical endpoint
  }
  return CANONICAL_RPC[chainId] ?? "http://127.0.0.1:8545";
}

const envChainId = parseChainId(clean(process.env.NEXT_PUBLIC_CHAIN_ID));
const envRpc = parseRpcUrl(clean(process.env.NEXT_PUBLIC_RPC_URL), envChainId);
const envName = clean(process.env.NEXT_PUBLIC_CHAIN_NAME) || (envChainId === 46630 ? "Robinhood Chain Testnet" : "Anvil");
const explorerName = clean(process.env.NEXT_PUBLIC_EXPLORER_NAME) || "Explorer";
const explorerUrl = clean(process.env.NEXT_PUBLIC_EXPLORER_URL);

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
export const walletConnectProjectId = clean(process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID);

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
