"use client";

import { useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import { useCallback, useMemo } from "react";
import type { Address, Log, PublicClient } from "viem";
import {
  DripReader,
  dripCoreAbi,
  streamEngineAbi,
  formatStock,
  formatUsdg,
  MODE_LABELS,
  type ActivityItem,
  type Deployment,
} from "@drip/sdk";
import { chainId, deploymentOrNull } from "@/lib/chain.config";

/**
 * All chain state, read through react-query.
 *
 * There is no backend. Every hook here is a view call or a log query, cached and
 * polled. The dashboard's live counters interpolate locally between polls so the
 * numbers move smoothly without spending an RPC call per frame.
 */

export function useDeployment(): Deployment | null {
  return useMemo(() => deploymentOrNull(), []);
}

export function useReader(): DripReader | null {
  const client = usePublicClient({ chainId });
  const deployment = useDeployment();
  return useMemo(() => {
    if (!client || !deployment) return null;
    return new DripReader(client as PublicClient, deployment);
  }, [client, deployment]);
}

/** Shared query defaults. Every read is polled, never assumed. */
function readerQuery<T>(
  key: unknown[],
  reader: DripReader | null,
  fn: (reader: DripReader) => Promise<T>,
  options?: Partial<UseQueryOptions<T>>
) {
  return {
    queryKey: key,
    queryFn: async () => {
      if (!reader) throw new Error("No deployment for this chain");
      return fn(reader);
    },
    enabled: Boolean(reader) && (options?.enabled ?? true),
    ...options,
  };
}

export function useStockTokens() {
  const reader = useReader();
  return useQuery(readerQuery(["stockTokens", chainId], reader, (r) => r.getStockTokens(), {
    refetchInterval: 30_000,
  }));
}

export function useCalendar() {
  const reader = useReader();
  return useQuery(readerQuery(["calendar", chainId], reader, (r) => r.getCalendar()));
}

export function usePositions() {
  const reader = useReader();
  const { address } = useAccount();
  return useQuery(
    readerQuery(["positions", chainId, address], reader, (r) => r.getPositions(address!), {
      enabled: Boolean(address),
    })
  );
}

export function useStreams() {
  const reader = useReader();
  const { address } = useAccount();
  return useQuery(
    readerQuery(["streams", chainId, address], reader, (r) => r.getStreams(address!), {
      enabled: Boolean(address),
      // Streams are the live surface. Poll harder here than anywhere else.
      refetchInterval: 5_000,
    })
  );
}

export function useActivatable() {
  const reader = useReader();
  const { address } = useAccount();
  return useQuery(
    readerQuery(["activatable", chainId, address], reader, (r) => r.getActivatable(address!), {
      enabled: Boolean(address),
    })
  );
}

export function useClaimableSettled() {
  const reader = useReader();
  const { address } = useAccount();
  return useQuery(
    readerQuery(["claimableSettled", chainId, address], reader, (r) => r.getClaimableSettled(address!), {
      enabled: Boolean(address),
    })
  );
}

export function useVaultStats() {
  const reader = useReader();
  return useQuery(readerQuery(["vaultStats", chainId], reader, (r) => r.getVaultStats()));
}

export function useVaultPosition() {
  const reader = useReader();
  const { address } = useAccount();
  return useQuery(
    readerQuery(["vaultPosition", chainId, address], reader, (r) => r.getVaultPosition(address!), {
      enabled: Boolean(address),
    })
  );
}

export function useWalletBalances() {
  const reader = useReader();
  const { address } = useAccount();
  return useQuery(
    readerQuery(["walletBalances", chainId, address], reader, (r) => r.getWalletBalances(address!), {
      enabled: Boolean(address),
    })
  );
}

export function useSlippageBps() {
  const reader = useReader();
  const { address } = useAccount();
  return useQuery(
    readerQuery(["slippage", chainId, address], reader, (r) => r.getSlippageBps(address!), {
      enabled: Boolean(address),
    })
  );
}

/** Invalidate everything after a transaction lands. Cheap, and always correct. */
export function useRefreshAll() {
  const qc = useQueryClient();
  return useCallback(() => {
    void qc.invalidateQueries();
  }, [qc]);
}

/** How far back the activity feed looks. Public testnets refuse unbounded log queries. */
const ACTIVITY_LOOKBACK_BLOCKS = 200_000n;

/**
 * The activity feed, straight from events.
 *
 * Deliberately no indexer. Six event types across two contracts, filtered by the
 * holder's address, is a handful of getLogs calls. If this ever needs history across
 * millions of blocks, that is when a ponder.sh setup earns its place in the repo.
 */
export function useActivity() {
  const client = usePublicClient({ chainId });
  const deployment = useDeployment();
  const { address } = useAccount();

  return useQuery<ActivityItem[]>({
    queryKey: ["activity", chainId, address],
    enabled: Boolean(client && deployment && address),
    refetchInterval: 12_000,
    queryFn: async () => {
      if (!client || !deployment || !address) return [];
      const latest = await client.getBlockNumber();
      const fromBlock = latest > ACTIVITY_LOOKBACK_BLOCKS ? latest - ACTIVITY_LOOKBACK_BLOCKS : 0n;

      const coreEvents = ["Deposited", "Withdrawn", "ModeSet", "Reinvested", "SettledEntitlementClaimed"] as const;

      const coreLogs = await Promise.all(
        coreEvents.map((name) =>
          client
            .getLogs({
              address: deployment.dripCore,
              event: findEvent(dripCoreAbi, name),
              args: { user: address },
              fromBlock,
              toBlock: latest,
            })
            .catch(() => [] as Log[])
        )
      );

      const claimLogs = await client
        .getLogs({
          address: deployment.streamEngine,
          event: findEvent(streamEngineAbi, "StreamClaimed"),
          args: { user: address },
          fromBlock,
          toBlock: latest,
        })
        .catch(() => [] as Log[]);

      const items: ActivityItem[] = [];
      coreLogs.flat().forEach((log) => items.push(describeCoreLog(log)));
      claimLogs.forEach((log) => items.push(describeClaimLog(log)));

      return items.sort((a, b) => Number(b.blockNumber - a.blockNumber));
    },
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function findEvent(abi: readonly unknown[], name: string): any {
  const found = (abi as any[]).find((entry) => entry.type === "event" && entry.name === name);
  if (!found) throw new Error(`Event ${name} missing from ABI`);
  return found;
}

function describeCoreLog(log: any): ActivityItem {
  const name = log.eventName as ActivityItem["kind"];
  const args = log.args ?? {};
  let summary: string = name;

  switch (name) {
    case "Deposited":
      summary = `Deposited ${formatStock(args.amount ?? 0n)} stock tokens`;
      break;
    case "Withdrawn":
      summary = `Withdrew ${formatStock(args.amount ?? 0n)} stock tokens`;
      break;
    case "ModeSet":
      summary = `Mode set to ${MODE_LABELS[Number(args.mode ?? 0)] ?? "unknown"}`;
      break;
    case "Reinvested":
      summary = `Reinvested into ${formatStock(args.tokensOut ?? 0n)} stock tokens`;
      break;
    case "SettledEntitlementClaimed":
      summary = `Claimed ${formatUsdg(args.amount ?? 0n)} USDG at the pay date`;
      break;
    default:
      break;
  }

  return { kind: name, blockNumber: log.blockNumber ?? 0n, txHash: log.transactionHash, summary };
}

function describeClaimLog(log: any): ActivityItem {
  const args = log.args ?? {};
  return {
    kind: "StreamClaimed",
    blockNumber: log.blockNumber ?? 0n,
    txHash: log.transactionHash,
    summary: `Claimed ${formatUsdg(args.amount ?? 0n)} USDG from a stream`,
  };
}
