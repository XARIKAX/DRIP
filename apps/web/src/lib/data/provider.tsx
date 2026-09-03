"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useAccount } from "wagmi";
import {
  Mode as ChainMode,
  buildActivate,
  buildApprove,
  buildClaimStream,
  buildDeposit,
  buildSetMode,
  buildStockFaucet,
  buildVaultDeposit,
  buildVaultWithdraw,
  buildWithdraw,
} from "@drip-markets/sdk";
import { isDeployed } from "@/lib/chain.config";
import {
  useActivity as useChainActivity,
  useCalendar as useChainCalendar,
  usePositions as useChainPositions,
  useStockTokens as useChainTokens,
  useStreams as useChainStreams,
  useVaultPosition as useChainVaultPosition,
  useVaultStats as useChainVaultStats,
  useWalletBalances as useChainWallet,
  useActivatable as useChainActivatable,
  useDeployment,
} from "@/lib/hooks";
import { useTxRunner } from "@/lib/tx";
import { mockStore } from "./mock";
import type {
  ActivityRow,
  CreditView,
  DividendRow,
  Holding,
  ModeName,
  PendingAdvance,
  PortfolioSummary,
  StreamRow,
  TokenInfo,
  VaultView,
  WalletBalances,
} from "./types";

/**
 * The one seam between the UI and its data.
 *
 * source === "demo": the seeded MockStore. Default for every visitor, wallet or not.
 * source === "chain": the wagmi/viem reads against a deployed protocol, entered only
 * when a wallet is connected AND this chain has an address book.
 *
 * Components call the use* hooks below and never learn which side they are on.
 * Connect wallet swaps the data source. It never gates the UI.
 */

type Source = "demo" | "chain";

const DataContext = createContext<{ source: Source }>({ source: "demo" });

export function DataProvider({ children }: { children: ReactNode }) {
  const { isConnected } = useAccount();
  const source: Source = isConnected && isDeployed ? "chain" : "demo";
  const value = useMemo(() => ({ source }), [source]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useDataSource(): Source {
  return useContext(DataContext).source;
}

/** Re-renders on every mock mutation. Cheap: the version is one integer. */
function useMockVersion(): number {
  return useSyncExternalStore(mockStore.subscribe, mockStore.getVersion, mockStore.getVersion);
}

// ---------------------------------------------------------------------------
// Conversions from chain models to view models
// ---------------------------------------------------------------------------

const USDG = 1e6;
const STOCK = 1e18;

const MODE_FROM_CHAIN: Record<number, ModeName> = { 0: "CASH_EARLY", 1: "STREAM", 2: "REINVEST" };
const MODE_TO_CHAIN: Record<ModeName, ChainMode> = {
  CASH_EARLY: ChainMode.CASH_EARLY,
  STREAM: ChainMode.STREAM,
  REINVEST: ChainMode.REINVEST,
};

/** Deterministic visual walk for chain mode, where no intraday series exists. */
function visualSpark(symbol: string): number[] {
  let seed = 0;
  for (const c of symbol) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  let a = seed || 7;
  const out = [1];
  for (let i = 1; i < 60; i++) {
    a = (a * 1103515245 + 12345) >>> 0;
    out.push(out[i - 1]! * (1 + 0.0001 + ((a / 4294967296) - 0.5) * 0.006));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Unified read hooks
// ---------------------------------------------------------------------------

export function useTokensView(): TokenInfo[] {
  const source = useDataSource();
  const version = useMockVersion();
  const chainTokens = useChainTokens();
  const chainCalendar = useChainCalendar();

  return useMemo(() => {
    if (source === "demo") return mockStore.tokens();
    return (chainTokens.data ?? []).map((t) => {
      const next = (chainCalendar.data ?? [])
        .filter((d) => d.symbol === t.symbol && d.exDate * 1000 > Date.now())
        .sort((x, y) => x.exDate - y.exDate)[0];
      return {
        symbol: t.symbol,
        name: t.name,
        priceUsd: Number(t.priceUsdg) / USDG,
        yieldPct: 0,
        perShare: next ? Number(next.amountPerToken) / USDG : 0,
        nextExDate: next ? next.exDate : null,
        payingNow: false,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, version, chainTokens.data, chainCalendar.data]);
}

export function useHoldings(): { rows: Holding[]; loading: boolean } {
  const source = useDataSource();
  const version = useMockVersion();
  const positions = useChainPositions();
  const tokens = useChainTokens();

  const rows = useMemo(() => {
    if (source === "demo") return mockStore.holdings();
    const priceOf = new Map((tokens.data ?? []).map((t) => [t.address, Number(t.priceUsdg) / USDG]));
    return (positions.data ?? []).map((p) => {
      const spark = visualSpark(p.symbol);
      return {
        symbol: p.symbol,
        amount: Number(p.amount) / STOCK,
        valueUsd: Number(p.valueUsdg) / USDG,
        mode: MODE_FROM_CHAIN[p.mode] ?? "STREAM",
        movePct: (spark[59]! / spark[0]! - 1) * 100,
        spark,
      } satisfies Holding;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, version, positions.data, tokens.data]);

  return { rows, loading: source === "chain" && positions.isLoading };
}

export function useStreamRows(): { rows: StreamRow[]; loading: boolean } {
  const source = useDataSource();
  const version = useMockVersion();
  const streams = useChainStreams();

  const rows = useMemo(() => {
    if (source === "demo") return mockStore.streams();
    return (streams.data ?? []).map((s) => ({
      id: Number(s.id),
      symbol: s.symbol,
      mode: MODE_FROM_CHAIN[s.mode] ?? "STREAM",
      totalUsd: Number(s.total) / USDG,
      claimedBaseUsd: Number(s.claimed) / USDG,
      baseTimeMs: Date.now(),
      ratePerSec: Number(s.ratePerSecondScaled) / 1e18 / USDG,
      start: s.start,
      end: s.end,
      closed: s.closed,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, version, streams.data]);

  return { rows, loading: source === "chain" && streams.isLoading };
}

export function useCalendarRows(): { rows: DividendRow[]; loading: boolean } {
  const source = useDataSource();
  const version = useMockVersion();
  const calendar = useChainCalendar();

  const rows = useMemo(() => {
    if (source === "demo") return mockStore.calendar();
    return (calendar.data ?? []).map((d) => ({
      id: Number(d.id),
      symbol: d.symbol,
      perShare: Number(d.amountPerToken) / USDG,
      exDate: d.exDate,
      payDate: d.payDate,
      status: d.status === 2 ? "SETTLED" : d.status === 3 ? "VOIDED" : "DECLARED",
      daysEarly: d.daysEarly,
    } satisfies DividendRow));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, version, calendar.data]);

  return { rows, loading: source === "chain" && calendar.isLoading };
}

export function useActivityRows(): { rows: ActivityRow[]; loading: boolean } {
  const source = useDataSource();
  const version = useMockVersion();
  const activity = useChainActivity();

  const rows = useMemo(() => {
    if (source === "demo") return mockStore.activity();
    return (activity.data ?? []).map((a, i) => ({
      id: i,
      kind:
        a.kind === "Reinvested"
          ? ("reinvest" as const)
          : a.kind === "StreamClaimed"
            ? ("claim" as const)
            : a.kind === "ModeSet"
              ? ("mode" as const)
              : a.kind === "Withdrawn"
                ? ("withdraw" as const)
                : ("deposit" as const),
      summary: a.summary,
      amountUsd: null,
      ts: 0,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, version, activity.data]);

  return { rows, loading: source === "chain" && activity.isLoading };
}

export function useVaultView(): { vault: VaultView; loading: boolean } {
  const source = useDataSource();
  const version = useMockVersion();
  const stats = useChainVaultStats();
  const position = useChainVaultPosition();

  const vault = useMemo(() => {
    if (source === "demo" || !stats.data) return mockStore.vault();
    const s = stats.data;
    const p = position.data;
    const history = mockStore.vault().apyHistory;
    return {
      tvlUsd: Number(s.totalAssets) / USDG,
      apyPct: Number(s.totalFeesAccrued) > 0 ? (Number(s.totalFeesAccrued) / Math.max(Number(s.totalAssets), 1)) * 400 : history[history.length - 1]!,
      utilizationPct: Number(s.utilizationBps) / 100,
      capPct: Number(s.maxUtilizationBps) / 100,
      advancesOutstandingUsd: Number(s.receivables) / USDG,
      feesEarnedUsd: Number(s.totalFeesAccrued) / USDG,
      sharePrice: Number(s.sharePrice) / USDG,
      freeLiquidityUsd: Number(s.freeCash) / USDG,
      yourShares: p ? Number(p.shares) / STOCK : 0,
      yourAssetsUsd: p ? Number(p.assets) / USDG : 0,
      maxWithdrawUsd: p ? Number(p.maxWithdraw) / USDG : 0,
      apyHistory: history,
    } satisfies VaultView;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, version, stats.data, position.data]);

  return { vault, loading: source === "chain" && stats.isLoading };
}

export function useWalletView(): WalletBalances {
  const source = useDataSource();
  const version = useMockVersion();
  const wallet = useChainWallet();
  const tokens = useChainTokens();

  return useMemo(() => {
    if (source === "demo") return mockStore.wallet();
    const stocks: Record<string, number> = {};
    for (const t of tokens.data ?? []) {
      stocks[t.symbol] = Number(wallet.data?.stocks[t.address] ?? 0n) / STOCK;
    }
    return { usdg: Number(wallet.data?.usdg ?? 0n) / USDG, stocks };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, version, wallet.data, tokens.data]);
}

export function usePendingAdvances(): PendingAdvance[] {
  const source = useDataSource();
  const version = useMockVersion();
  const activatable = useChainActivatable();

  return useMemo(() => {
    if (source === "demo") return mockStore.pendingAdvances();
    return (activatable.data ?? []).map(({ dividend, gross }) => ({
      dividendId: Number(dividend.id),
      symbol: dividend.symbol,
      grossUsd: Number(gross) / USDG,
      exDate: dividend.exDate,
      payDate: dividend.payDate,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, version, activatable.data]);
}

export function useCreditView(): CreditView {
  const source = useDataSource();
  const version = useMockVersion();
  return useMemo(() => {
    // The lending market exists in demo mode today; the chain deployment follows the
    // audited LendingPool. Chain mode shows the same shape with nothing drawn.
    if (source === "chain") {
      const empty = mockStore.credit();
      return { ...empty, borrowedUsd: 0, availableUsd: empty.maxBorrowUsd, healthFactor: Infinity, servicedBaseUsd: 0, servicedRatePerSec: 0 };
    }
    return mockStore.credit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, version]);
}

export function usePortfolioSummary(): PortfolioSummary {
  const source = useDataSource();
  const version = useMockVersion();
  const { rows: holdings } = useHoldings();
  const { rows: streams } = useStreamRows();
  const { rows: calendar } = useCalendarRows();

  return useMemo(() => {
    if (source === "demo") return mockStore.summary();
    const nowMs = Date.now();
    let value = holdings.reduce((sum, h) => sum + h.valueUsd, 0);
    let rate = 0;
    for (const s of streams) {
      if (!s.closed && nowMs >= s.start * 1000 && nowMs < s.end * 1000) rate += s.ratePerSec;
    }
    const next = calendar
      .filter((d) => d.status === "DECLARED" && d.exDate * 1000 > nowMs)
      .sort((x, y) => x.exDate - y.exDate)[0];
    return {
      valueUsd: value,
      streamRatePerSec: rate,
      earnedThisWeekUsd: streams.reduce((sum, s) => sum + s.claimedBaseUsd, 0),
      activeRules: holdings.length,
      nextDividend: next ? { symbol: next.symbol, exDate: next.exDate } : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, version, holdings, streams, calendar]);
}

// ---------------------------------------------------------------------------
// Unified actions
// ---------------------------------------------------------------------------

export interface DataActions {
  source: Source;
  busy: boolean;
  setMode: (symbol: string, mode: ModeName) => Promise<void>;
  claimStream: (id: number) => Promise<void>;
  startPending: (dividendId: number) => Promise<void>;
  deposit: (symbol: string, shares: number, mode?: ModeName) => Promise<void>;
  withdraw: (symbol: string, shares: number) => Promise<void>;
  faucet: (symbol: string) => Promise<void>;
  vaultDeposit: (usd: number) => Promise<void>;
  vaultWithdraw: (usd: number) => Promise<void>;
  borrow: (usd: number) => Promise<void>;
  repay: (usd: number) => Promise<void>;
}

export function useDataActions(): DataActions {
  const source = useDataSource();
  const deployment = useDeployment();
  const { address } = useAccount();
  const { state, run } = useTxRunner();
  const tokens = useChainTokens();
  const [demoBusy, setDemoBusy] = useState(false);

  const addressOf = useCallback(
    (symbol: string) => (tokens.data ?? []).find((t) => t.symbol === symbol)?.address,
    [tokens.data]
  );

  /** Demo actions land instantly; the tiny delay keeps button feedback honest. */
  const demo = useCallback(async (fn: () => void) => {
    setDemoBusy(true);
    await new Promise((r) => setTimeout(r, 220));
    fn();
    setDemoBusy(false);
  }, []);

  return useMemo<DataActions>(() => {
    if (source === "demo") {
      return {
        source,
        busy: demoBusy,
        setMode: (symbol, mode) => demo(() => mockStore.setMode(symbol, mode)),
        claimStream: (id) => demo(() => void mockStore.claimStream(id)),
        startPending: (id) => demo(() => mockStore.startPending(id)),
        deposit: (symbol, shares, mode) =>
          demo(() => {
            mockStore.deposit(symbol, shares);
            if (mode) mockStore.setMode(symbol, mode);
          }),
        withdraw: (symbol, shares) => demo(() => mockStore.withdraw(symbol, shares)),
        faucet: (symbol) => demo(() => mockStore.faucet(symbol)),
        vaultDeposit: (usd) => demo(() => mockStore.vaultDeposit(usd)),
        vaultWithdraw: (usd) => demo(() => mockStore.vaultWithdraw(usd)),
        borrow: (usd) => demo(() => mockStore.borrow(usd)),
        repay: (usd) => demo(() => mockStore.repay(usd)),
      };
    }

    const busy = state.status === "signing" || state.status === "confirming";
    const need = <T,>(v: T | undefined | null, what: string): T => {
      if (v === undefined || v === null) throw new Error(`${what} unavailable`);
      return v;
    };

    return {
      source,
      busy,
      setMode: async (symbol, mode) => {
        const d = need(deployment, "deployment");
        const token = need(addressOf(symbol), symbol);
        await run([buildSetMode(d, token, MODE_TO_CHAIN[mode], symbol)]);
      },
      claimStream: async (id) => {
        const d = need(deployment, "deployment");
        await run([buildClaimStream(d, BigInt(id))]);
      },
      startPending: async (dividendId) => {
        const d = need(deployment, "deployment");
        await run([buildActivate(d, BigInt(dividendId), need(address, "wallet"))]);
      },
      deposit: async (symbol, shares, mode) => {
        const d = need(deployment, "deployment");
        const token = need(addressOf(symbol), symbol);
        const base = BigInt(Math.round(shares * 1e6)) * 10n ** 12n;
        const txs = [buildApprove(token, d.dripCore, base, symbol), buildDeposit(d, token, base, symbol)];
        if (mode) txs.push(buildSetMode(d, token, MODE_TO_CHAIN[mode], symbol));
        await run(txs);
      },
      withdraw: async (symbol, shares) => {
        const d = need(deployment, "deployment");
        const token = need(addressOf(symbol), symbol);
        await run([buildWithdraw(d, token, BigInt(Math.round(shares * 1e6)) * 10n ** 12n, symbol)]);
      },
      faucet: async (symbol) => {
        const token = need(addressOf(symbol), symbol);
        await run([buildStockFaucet(token, symbol)]);
      },
      vaultDeposit: async (usd) => {
        const d = need(deployment, "deployment");
        const owner = need(address, "wallet");
        const base = BigInt(Math.round(usd * 1e6));
        await run([buildApprove(d.usdg, d.advanceVault, base, "USDG"), buildVaultDeposit(d, base, owner)]);
      },
      vaultWithdraw: async (usd) => {
        const d = need(deployment, "deployment");
        const owner = need(address, "wallet");
        await run([buildVaultWithdraw(d, BigInt(Math.round(usd * 1e6)), owner, owner)]);
      },
      borrow: async () => {
        throw new Error("The lending market is not deployed onchain yet. Try demo mode.");
      },
      repay: async () => {
        throw new Error("The lending market is not deployed onchain yet. Try demo mode.");
      },
    };
  }, [source, demoBusy, demo, state.status, deployment, address, addressOf, run]);
}
