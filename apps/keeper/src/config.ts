import { defineChain, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getDeployment, type Deployment } from "@drip-markets/sdk";

/**
 * Everything the keeper needs, resolved once at boot and never guessed at.
 *
 * A keeper that starts with half a config and discovers the rest at the moment it
 * would spend money is worse than one that refuses to start, so every required value
 * is read here and a missing one is fatal.
 */
export interface KeeperConfig {
  chain: Chain;
  deployment: Deployment;
  rpcUrl: string;
  account: ReturnType<typeof privateKeyToAccount>;
  /** Where to begin scanning for holders. The protocol's first deploy block. */
  startBlock: bigint;
  /** getLogs window. Public RPCs cap this; 10k is safe on Robinhood Chain. */
  logChunk: bigint;
  intervalMs: number;
  /** Settlement moves real USDG out of the keeper wallet, so it is opt in. */
  settleEnabled: boolean;
  /** Report what would happen and broadcast nothing. */
  dryRun: boolean;
  runOnce: boolean;
  port: number;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") throw new Error(`${name} is required`);
  return v.trim();
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v.trim() === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got ${v}`);
  return n;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v.trim() === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());
}

export function loadConfig(): KeeperConfig {
  const chainId = num("CHAIN_ID", 4663);
  const rpcUrl = required("RPC_URL");

  // 0x prefixed, 32 bytes. cast accepts bare hex and viem does not, which is a
  // difference worth failing loudly on rather than at the first signature.
  const raw = required("KEEPER_PRIVATE_KEY");
  const key = raw.startsWith("0x") ? raw : `0x${raw}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error("KEEPER_PRIVATE_KEY must be 0x followed by 64 hex characters");
  }

  const chain = defineChain({
    id: chainId,
    name: process.env.CHAIN_NAME ?? "Robinhood Chain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });

  return {
    chain,
    deployment: getDeployment(chainId),
    rpcUrl,
    account: privateKeyToAccount(key as `0x${string}`),
    startBlock: BigInt(required("START_BLOCK")),
    logChunk: BigInt(num("LOG_CHUNK", 10_000)),
    intervalMs: num("POLL_SECONDS", 300) * 1000,
    settleEnabled: bool("SETTLE_ENABLED", false),
    dryRun: bool("DRY_RUN", false),
    runOnce: bool("KEEPER_RUN_ONCE", false),
    port: num("PORT", 8080),
  };
}
