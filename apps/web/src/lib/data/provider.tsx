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
  buildRewardRedeem,
  buildVaultDeposit,
  buildVaultWithdraw,
  buildWithdraw,
  estimateApyBps,
  buildBorrow,
  buildRepay,
  buildSetAutoRepayPrincipal,
  buildSplit,
  buildMerge,
  buildRedeemPrincipal,
  buildSellYield,
  buildFreezeSeries,
  buildClaimYield,
  listings,
} from "@drip-markets/sdk";
import { chainId, hasFaucets, isDeployed } from "@/lib/chain.config";
import {
  useActivity as useChainActivity,
  useCalendar as useChainCalendar,
  usePositions as useChainPositions,
  useStockTokens as useChainTokens,
  useStreams as useChainStreams,
  useVaultPosition as useChainVaultPosition,
  useVaultStats as useChainVaultStats,
  useRewardStats as useChainRewardStats,
  useRewardPosition as useChainRewardPosition,
  useProtocolTotals as useChainProtocolTotals,
  useWalletBalances as useChainWallet,
  useActivatable as useChainActivatable,
  useCredit as useChainCredit,
  useCreditParameters as useChainCreditParams,
  useAutoRepayPrincipal as useChainAutoRepay,
  useSplitSeriesList as useChainSplitSeries,
  useSplitPositionFor as useChainSplitPosition,
  useWalletBalances as useChainWalletBalances,
  useDeployment,
} from "@/lib/hooks";
import { useTxRunner } from "@/lib/tx";
import { demoStore, mockStore, type MockStore } from "./mock";
import type {
  ActivityRow,
  CreditView,
  DividendRow,
  Holding,
  ModeName,
  PendingAdvance,
  PortfolioSummary,
  RewardView,
  SplitPosition,
  SplitSeries,
  StreamRow,
  TokenInfo,
  TrackerView,
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

const DataContext = createContext<{ source: Source; showcase: boolean }>({
  source: "demo",
  showcase: false,
});

export function DataProvider({ children }: { children: ReactNode }) {
  const { isConnected } = useAccount();
  const source: Source = isConnected && isDeployed ? "chain" : "demo";
  const value = useMemo(() => ({ source, showcase: false }), [source]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

/**
 * Opt a subtree into the seeded portfolio.
 *
 * The product and the pitch want opposite things from the same components. A visitor
 * opening the dashboard should see their own account, which on arrival is empty. A
 * visitor reading the landing page or the docs should see the thing working, which
 * needs an account with something in it. Same hooks, same components; the surface
 * decides which store answers.
 *
 * It overrides the store only, never the source: with a wallet connected on a
 * deployed chain these surfaces still read the chain, exactly as before.
 */
export function ShowcaseData({ children }: { children: ReactNode }) {
  const { source } = useContext(DataContext);
  const value = useMemo(() => ({ source, showcase: true }), [source]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useDataSource(): Source {
  return useContext(DataContext).source;
}

/** True on the pitch surfaces, which want the seeded portfolio rather than a real one. */
function useShowcase(): boolean {
  return useContext(DataContext).showcase;
}

/** The store this subtree reads: the visitor's own, or the seeded showcase one. */
function useStore(): MockStore {
  return useContext(DataContext).showcase ? demoStore : mockStore;
}

/** The store plus a version that re-renders on every mutation of it. Cheap: one integer. */
function useMockData(): { store: MockStore; version: number } {
  const store = useStore();
  const version = useSyncExternalStore(store.subscribe, store.getVersion, store.getVersion);
  return { store, version };
}

// ---------------------------------------------------------------------------
// Conversions from chain models to view models
// ---------------------------------------------------------------------------

const USDG = 1e6;
const STOCK = 1e18;

/**
 * UI decimal shares to the 18 decimal base unit, via a 6dp intermediate.
 *
 * Floors, never rounds. Math.round here rounded 0.1175176... up to 0.117518, which is
 * MORE than the wallet held, and every Max deposit of a balance whose seventh decimal
 * was 5 or above reverted with ERC20InsufficientBalance. Asking for fractionally less
 * than the user typed costs a sliver of dust; asking for more costs the transaction.
 */
function toStockBase(shares: number): bigint {
  return BigInt(Math.floor(shares * 1e6)) * 10n ** 12n;
}

/**
 * The amount to actually send, given what the UI asked for and what is really there.
 *
 * Two corrections, both of our own lossiness rather than of the user:
 *
 *   over    Never send more than the wallet holds. The request is a float that has
 *           been through 1e18, past JavaScript's 2^53 safe integer limit, so it is an
 *           approximation of the balance before any rounding is applied to it.
 *   under   Within one 6dp unit of the whole balance, send the whole balance. Max put
 *           the full amount in the box; the only reason it cannot be sent exactly is
 *           the conversion above, and rounding it down would leave dust the user
 *           explicitly asked to move.
 *
 * Both directions resolve to a figure read from the chain, so neither can overspend.
 */
function resolveAmount(requested: bigint, available: bigint | undefined): bigint {
  if (available === undefined) return requested;
  if (requested > available) return available;
  if (available - requested < 10n ** 12n) return available;
  return requested;
}

const MODE_FROM_CHAIN: Record<number, ModeName> = { 0: "CASH_EARLY", 1: "STREAM", 2: "REINVEST" };
const MODE_TO_CHAIN: Record<ModeName, ChainMode> = {
  CASH_EARLY: ChainMode.CASH_EARLY,
  STREAM: ChainMode.STREAM,
  REINVEST: ChainMode.REINVEST,
};

/**
 * Annualised dividend yield from the declared calendar.
 *
 * The next declared payment, annualised by how often that stock actually pays, over
 * the current price. Null when anything needed is missing — nothing declared, no
 * price, or no stated frequency — because the honest answer then is "we do not know
 * yet", not zero.
 *
 * This multiplied by four unconditionally until it was pointed out that not every
 * stock is a quarterly payer. Four halves a semi annual payer's yield into looking
 * right and manufactures one outright for a stock that has never paid a dividend at
 * all, which is most of a mega cap technology basket.
 */
/** The rate Osinko is targeting for a stock. Not a promise, and not what was paid. */
function targetRatePct(symbol: string): number | null {
  return listings[chainId]?.tokens.find((t) => t.symbol === symbol)?.rewardRatePct ?? null;
}

// ---------------------------------------------------------------------------
// Unified read hooks
// ---------------------------------------------------------------------------

export function useTokensView(): TokenInfo[] {
  const source = useDataSource();
  const { store, version } = useMockData();
  const chainTokens = useChainTokens();
  const chainCalendar = useChainCalendar();
  const totals = useChainProtocolTotals();

  return useMemo(() => {
    if (source === "demo") return store.tokens();
    return (chainTokens.data ?? []).map((t) => {
      const next = (chainCalendar.data ?? [])
        .filter((d) => d.symbol === t.symbol && d.exDate * 1000 > Date.now())
        .sort((x, y) => x.exDate - y.exDate)[0];
      // Number(null) is 0, which would render an unpriceable stock as worthless.
      const priceUsd = t.priceUsdg === null ? null : Number(t.priceUsdg) / USDG;
      const perShare = next ? Number(next.amountPerToken) / USDG : undefined;
      const nowSec = Date.now() / 1000;
      return {
        symbol: t.symbol,
        name: t.name,
        priceUsd,
        // Realised first: once a pot has actually been handed out, show what this
        // stock earned rather than what it was aiming at. The target is the stand in
        // until there is a fact to replace it with, never the other way round.
        ...(() => {
          const realised = (totals.data?.byToken ?? []).find((r) => r.symbol === t.symbol)?.realisedPct;
          return typeof realised === "number"
            ? { yieldPct: realised, yieldRealised: true }
            : { yieldPct: targetRatePct(t.symbol), yieldRealised: false };
        })(),
        perShare: perShare ?? 0,
        nextExDate: next ? next.exDate : null,
        // Paying now means the calendar has this token between its ex and pay dates.
        payingNow: (chainCalendar.data ?? []).some(
          (d) => d.symbol === t.symbol && d.exDate <= nowSec && nowSec < d.payDate
        ),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, version, chainTokens.data, chainCalendar.data]);
}

export function useHoldings(): { rows: Holding[]; loading: boolean } {
  const source = useDataSource();
  const { store, version } = useMockData();
  const positions = useChainPositions();
  const tokens = useChainTokens();

  const rows = useMemo(() => {
    if (source === "demo") return store.holdings();
    return (positions.data ?? []).map((p) => {
      return {
        symbol: p.symbol,
        amount: Number(p.amount) / STOCK,
        valueUsd: p.valueUsdg === null ? null : Number(p.valueUsdg) / USDG,
        mode: MODE_FROM_CHAIN[p.mode] ?? "STREAM",
        // No intraday history onchain: the oracle answers one price, now. The
        // reference portfolio draws a walk to show the shape of the UI; drawing one
        // here would put an invented price movement next to somebody's real money.
        movePct: null,
        spark: [],
      } satisfies Holding;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, version, positions.data, tokens.data]);

  return { rows, loading: source === "chain" && positions.isLoading };
}

export function useStreamRows(): { rows: StreamRow[]; loading: boolean } {
  const source = useDataSource();
  const { store, version } = useMockData();
  const streams = useChainStreams();

  const rows = useMemo(() => {
    if (source === "demo") return store.streams();
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
  const { store, version } = useMockData();
  const calendar = useChainCalendar();

  const rows = useMemo(() => {
    if (source === "demo") return store.calendar();
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
  const { store, version } = useMockData();
  const activity = useChainActivity();

  const rows = useMemo(() => {
    if (source === "demo") return store.activity();
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

/**
 * The reward programme. Null when this deployment has no vault, which the app has to
 * render around rather than throw on: the protocol shipped before it existed.
 */
export function useRewardView(): { reward: RewardView | null; loading: boolean } {
  const stats = useChainRewardStats();
  const position = useChainRewardPosition();

  const reward = useMemo(() => {
    const s = stats.data;
    if (!s) return null;
    const p = position.data;
    return {
      yoursUsd: Number(p?.balance ?? 0n) / USDG,
      yourEarnedUsd: Number(p?.lifetimeEarned ?? 0n) / USDG,
      yourCollectedUsd: Number(p?.lifetimeRedeemed ?? 0n) / USDG,
      yourHistoryRead: p?.historyRead ?? false,
      outstandingUsd: Number(s.totalSupply) / USDG,
      fundedUsd: Number(s.totalFunded) / USDG,
      redeemedUsd: Number(s.totalRedeemed) / USDG,
      unallocatedUsd: Number(s.unallocated) / USDG,
    } satisfies RewardView;
  }, [stats.data, position.data]);

  return { reward, loading: stats.isLoading };
}

/**
 * The tracker's numbers. Chain only and wallet free: it is a public scoreboard, so it
 * reads the same for a visitor as for a holder. Null before the reads land, or on a
 * chain with no deployment — the page says so rather than rendering zeros as fact.
 */
export function useTrackerView(): { tracker: TrackerView | null; loading: boolean } {
  const totals = useChainProtocolTotals();

  const tracker = useMemo(() => {
    const t = totals.data;
    if (!t) return null;
    return {
      stockUsd: Number(t.stockUsdg) / USDG,
      unpriced: t.unpriced,
      rows: t.byToken.map((r) => ({
        symbol: r.symbol,
        // 18 decimal balances go past 2^53, so divide in bigint before Number().
        amount: Number((r.amount * 10_000n) / 10n ** 18n) / 10_000,
        valueUsd: r.valueUsdg === null ? null : Number(r.valueUsdg) / USDG,
      })),
      paidOutUsd: Number(t.paidOutUsdg) / USDG,
      owedUsd: Number(t.owedUsdg) / USDG,
      fundedUsd: Number(t.fundedUsdg) / USDG,
    } satisfies TrackerView;
  }, [totals.data]);

  return { tracker, loading: totals.isLoading };
}

/**
 * A pool with nothing read yet. Not the sample pool.
 *
 * The seeded store describes a pool with millions in it, which is the right thing to
 * show a visitor reading the pitch and exactly the wrong thing to show a holder whose
 * read has not landed: for as long as the query is in flight the page claimed a TVL
 * three orders of magnitude off, then swapped it for the truth. A number nobody should
 * act on must not be rendered as though somebody could.
 */
const EMPTY_VAULT: VaultView = {
  tvlUsd: 0,
  apyPct: 0,
  utilizationPct: 0,
  capPct: 0,
  advancesOutstandingUsd: 0,
  feesEarnedUsd: 0,
  sharePrice: 0,
  freeLiquidityUsd: 0,
  yourShares: 0,
  yourAssetsUsd: 0,
  maxWithdrawUsd: 0,
  apyHistory: [],
};

/**
 * The pool.
 *
 * Unlike every other view here this one ignores the wallet, because the pool is not a
 * wallet's business: how much USDG is in it, how much is lent out and what it has
 * earned are public facts about the protocol, readable from any RPC. Gating them on a
 * connection meant a visitor who had not connected saw the seeded pool's $2.8m in
 * place of the real balance — the pitch's numbers presented as the product's.
 *
 * Only the three personal figures need an account, and they already default to zero
 * without one. The seeded pool survives exactly where it belongs: behind ShowcaseData,
 * on the landing page and in the docs.
 */
export function useVaultView(): { vault: VaultView; loading: boolean } {
  const showcase = useShowcase();
  const { store, version } = useMockData();
  const stats = useChainVaultStats();
  const position = useChainVaultPosition();
  const deployedAt = useDeployment()?.deployedAt ?? 0;

  const vault = useMemo(() => {
    if (showcase) return store.vault();
    // Nothing read yet, or no address book on this chain: zeros, never the sample pool.
    if (!stats.data) return EMPTY_VAULT;
    const s = stats.data;
    const p = position.data;

    // Fees earned over the pool's actual life, annualised. The old formula multiplied
    // the fee ratio by a constant and fell back to the reference store's history when
    // no fees had accrued, which drew an invented APY curve on a real pool.
    const secondsLive = deployedAt ? Math.max(Date.now() / 1000 - deployedAt, 1) : 0;
    const apyPct = estimateApyBps(s.totalFeesAccrued, s.totalAssets, secondsLive) / 100;

    return {
      tvlUsd: Number(s.totalAssets) / USDG,
      apyPct,
      utilizationPct: Number(s.utilizationBps) / 100,
      capPct: Number(s.maxUtilizationBps) / 100,
      advancesOutstandingUsd: Number(s.receivables) / USDG,
      feesEarnedUsd: Number(s.totalFeesAccrued) / USDG,
      sharePrice: Number(s.sharePrice) / USDG,
      freeLiquidityUsd: Number(s.freeCash) / USDG,
      // Pool shares are the vault's own decimals, not a stock token's 1e18. Dividing by
      // STOCK here rendered a real 50 share position as 0.0000 next to $50.00 of assets.
      yourShares: p ? Number(p.shares) / 10 ** s.shareDecimals : 0,
      yourAssetsUsd: p ? Number(p.assets) / USDG : 0,
      maxWithdrawUsd: p ? Number(p.maxWithdraw) / USDG : 0,
      // One point, not a curve. There is no historical series onchain to read, and
      // borrowing the reference store's would draw a past this pool never had.
      apyHistory: [apyPct],
    } satisfies VaultView;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showcase, version, stats.data, position.data, deployedAt]);

  return { vault, loading: !showcase && stats.isLoading };
}

export function useWalletView(): WalletBalances {
  const source = useDataSource();
  const { store, version } = useMockData();
  const wallet = useChainWallet();
  const tokens = useChainTokens();

  return useMemo(() => {
    if (source === "demo") return store.wallet();
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
  const { store, version } = useMockData();
  const activatable = useChainActivatable();

  return useMemo(() => {
    if (source === "demo") return store.pendingAdvances();
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
  const { store, version } = useMockData();
  const credit = useChainCredit();
  const params = useChainCreditParams();
  const { rows: holdings } = useHoldings();
  const { rows: calendar } = useCalendarRows();

  return useMemo(() => {
    if (source === "demo") return store.credit();

    const c = credit.data;
    const p = params.data;
    // No lending pool on this chain, or the read has not landed yet. Render the page
    // with nothing drawn rather than throwing; the address book may predate the market.
    if (!c || !p) {
      const empty = store.credit();
      return {
        ...empty,
        collateralValueUsd: 0,
        maxBorrowUsd: 0,
        borrowedUsd: 0,
        availableUsd: 0,
        healthFactor: Infinity,
        dividendsPerYearUsd: 0,
        interestPerYearUsd: 0,
        netCarryPerYearUsd: 0,
        servicedBaseUsd: 0,
        servicedRatePerSec: 0,
      };
    }

    const borrowedUsd = Number(c.debt) / USDG;
    const borrowAprPct = Number(c.borrowRateBps) / 100;

    // Annualised from the declared calendar: what each holding's next dividend pays,
    // four times over. The same quarterly assumption the reference portfolio makes,
    // and the honest one until a full year of real declarations exists to average.
    const perShare = new Map(calendar.map((d) => [d.symbol, d.perShare]));
    const dividendsPerYearUsd = holdings.reduce(
      (sum, h) => sum + h.amount * (perShare.get(h.symbol) ?? 0) * 4,
      0
    );
    const interestPerYearUsd = (borrowedUsd * borrowAprPct) / 100;

    // Dividends can only service interest that exists, so the rate is bounded by both.
    const servicedRatePerSec = Math.min(dividendsPerYearUsd, interestPerYearUsd) / (365 * 24 * 3600);

    return {
      collateralValueUsd: Number(c.collateralUsdg) / USDG,
      maxBorrowUsd: Number(c.borrowingPower) / USDG,
      borrowedUsd,
      availableUsd: Number(c.available) / USDG,
      healthFactor: borrowedUsd > 0 ? Number(c.healthFactorBps) / 10_000 : Infinity,
      maxLtvPct: Number(p.maxLtvBps) / 100,
      liqThresholdPct: Number(p.liquidationThresholdBps) / 100,
      borrowAprPct,
      dividendsPerYearUsd,
      interestPerYearUsd,
      netCarryPerYearUsd: dividendsPerYearUsd - interestPerYearUsd,
      servicedBaseUsd: Number(c.servicedFromDividends) / USDG,
      servicedRatePerSec,
    } satisfies CreditView;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, version, credit.data, params.data, holdings, calendar]);
}

/** Whether this holder lets dividends pay down principal, not just interest. */
export function useAutoRepayPrincipal(): boolean {
  const source = useDataSource();
  const chain = useChainAutoRepay();
  return source === "demo" ? false : Boolean(chain.data);
}

/**
 * Split: the module that separates a stock from its dividends.
 *
 * `multiplier` is the whole yield in one number. A Robinhood Chain stock token pays
 * no cash — a dividend is reinvested and ERC-8056's multiplier rises while the raw
 * balance stays put. So the growth from `startMultiplier` to `multiplier` IS the
 * dividend this series has seen, and it is the figure everything on the page is
 * derived from.
 */
export function useSplitSeries(): SplitSeries[] {
  const source = useDataSource();
  const { store, version } = useMockData();
  const chain = useChainSplitSeries();

  return useMemo(() => {
    if (source === "demo") return store.splitSeriesList();
    return (chain.data ?? []).map((s) => {
      const priceUsd = s.priceUsdg === null ? null : Number(s.priceUsdg) / USDG;
      return {
        seriesId: Number(s.seriesId),
        symbol: s.symbol,
        name: s.name,
        maturity: s.maturity,
        splitFeeBps: s.splitFeeBps,
        ptSupply: Number(s.ptSupply) / STOCK,
        ytSupply: Number(s.ytSupply) / STOCK,
        underlyingPriceUsd: priceUsd,
        multiplier: Number(s.multiplier) / STOCK,
        startMultiplier: Number(s.startMultiplier) / STOCK,
        // What the underlying has actually paid since this series opened. Realised,
        // not annualised — see the tracker for why extrapolating it invents a number.
        earnedPct:
          s.startMultiplier > 0n
            ? (Number(s.multiplier - s.startMultiplier) / Number(s.startMultiplier)) * 100
            : 0,
        frozen: s.frozen,
        ytBidUsd: Number(s.ytBidUsdg) / USDG,
        ytBudgetUsd: Number(s.ytBudgetUsdg) / USDG,
      } satisfies SplitSeries;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, version, chain.data]);
}

export function useSplitPosition(seriesId: number): SplitPosition | null {
  const source = useDataSource();
  const { store, version } = useMockData();
  const chain = useChainSplitPosition(seriesId);

  return useMemo(() => {
    if (source === "demo") return store.splitPosition(seriesId);
    const p = chain.data;
    if (!p) return null;
    return {
      seriesId: Number(p.seriesId),
      ptBalance: Number(p.ptBalance) / STOCK,
      ytBalance: Number(p.ytBalance) / STOCK,
      principalStock: Number(p.principalRaw) / STOCK,
      claimableStock: Number(p.claimableRaw) / STOCK,
    } satisfies SplitPosition;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, version, seriesId, chain.data]);
}

export function useSplitWalletBalance(symbol: string): number {
  const source = useDataSource();
  const { store, version } = useMockData();
  const wallet = useChainWalletBalances();
  const tokens = useChainTokens();

  return useMemo(() => {
    if (source === "demo") return store.splitWalletBalance(symbol);
    const token = (tokens.data ?? []).find((t) => t.symbol === symbol);
    if (!token) return 0;
    return Number(wallet.data?.stocks[token.address] ?? 0n) / STOCK;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, version, symbol, wallet.data, tokens.data]);
}

export function usePortfolioSummary(): PortfolioSummary {
  const source = useDataSource();
  const { store, version } = useMockData();
  const { rows: holdings } = useHoldings();
  const { rows: streams } = useStreamRows();
  const { rows: calendar } = useCalendarRows();
  const { reward } = useRewardView();

  return useMemo(() => {
    if (source === "demo") return store.summary();
    const nowMs = Date.now();
    // Stock plus what it has earned and not yet been collected, which is what the tile
    // says it is. Uncollected YT is money the holder already owns — leaving it out
    // understated a $36 position holding $48 of rewards by more than half.
    const value = holdings.reduce((sum, h) => sum + (h.valueUsd ?? 0), 0) + (reward?.yoursUsd ?? 0);
    const unpricedHoldings = holdings.filter((h) => h.valueUsd === null).length;
    let rate = 0;
    for (const s of streams) {
      if (!s.closed && nowMs >= s.start * 1000 && nowMs < s.end * 1000) rate += s.ratePerSec;
    }
    const held = new Set(holdings.map((h) => h.symbol));
    const next = calendar
      .filter((d) => d.status === "DECLARED" && d.exDate * 1000 > nowMs && held.has(d.symbol))
      .sort((x, y) => x.exDate - y.exDate)[0];
    return {
      valueUsd: value,
      unpricedHoldings,
      streamRatePerSec: rate,
      // Streams pay per second and rewards land in lumps; both are money this wallet
      // earned. `redeemedUsd` is the protocol's cumulative redemptions, not this
      // holder's, and using it here showed one wallet the sum of everybody's.
      earnedUsd:
        streams.reduce((sum, s) => sum + s.claimedBaseUsd, 0) + (reward?.yourEarnedUsd ?? 0),
      activeRules: holdings.length,
      nextDividend: next ? { symbol: next.symbol, exDate: next.exDate } : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, version, holdings, streams, calendar, reward]);
}

// ---------------------------------------------------------------------------
// Unified actions
// ---------------------------------------------------------------------------

export interface DataActions {
  source: Source;
  busy: boolean;
  /**
   * Whether a faucet exists to offer. The sample portfolio always has one; a chain
   * only does while it runs the mock stock tokens. On a production book the real
   * stock token has no faucet() and the button would only ever revert.
   */
  canFaucet: boolean;
  setMode: (symbol: string, mode: ModeName) => Promise<void>;
  claimStream: (id: number) => Promise<void>;
  startPending: (dividendId: number) => Promise<void>;
  deposit: (symbol: string, shares: number, mode?: ModeName) => Promise<void>;
  withdraw: (symbol: string, shares: number) => Promise<void>;
  faucet: (symbol: string) => Promise<void>;
  vaultDeposit: (usd: number) => Promise<void>;
  vaultWithdraw: (usd: number) => Promise<void>;
  /**
   * Burn YT for the USDG behind it. Nothing else moves: the stock that earned the
   * reward stays on deposit and keeps earning.
   */
  redeemReward: (usd: number) => Promise<void>;
  borrow: (usd: number) => Promise<void>;
  repay: (usd: number) => Promise<void>;
  /** Opt dividend income into paying down principal, not just interest. */
  setAutoRepayPrincipal: (enabled: boolean) => Promise<void>;
  split: (seriesId: number, amount: number) => Promise<void>;
  merge: (seriesId: number, amount: number) => Promise<void>;
  redeemPrincipal: (seriesId: number, amount: number) => Promise<void>;
  /** Collect everything this series' dividend tokens have earned, paid in stock. */
  claimYield: (seriesId: number) => Promise<void>;
  /** Sell dividend tokens to the market for cash now, at the posted bid. */
  sellYield: (seriesId: number, amount: number, minUsdOut: number) => Promise<void>;
  /** Stop a matured series' yield clock. Permissionless. */
  freezeSeries: (seriesId: number) => Promise<void>;
}

export function useDataActions(): DataActions {
  const source = useDataSource();
  const deployment = useDeployment();
  const { address } = useAccount();
  const { state, run } = useTxRunner();
  const walletBalances = useChainWalletBalances();
  const positions = useChainPositions();
  const tokens = useChainTokens();
  const [demoBusy, setDemoBusy] = useState(false);

  const addressOf = useCallback(
    (symbol: string) => (tokens.data ?? []).find((t) => t.symbol === symbol)?.address,
    [tokens.data]
  );

  const seriesList = useChainSplitSeries();
  const seriesSymbol = useCallback(
    (seriesId: number) => (seriesList.data ?? []).find((s) => Number(s.seriesId) === seriesId)?.symbol ?? "",
    [seriesList.data]
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
        canFaucet: true,
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
        redeemReward: async () => {},
        vaultDeposit: (usd) => demo(() => mockStore.vaultDeposit(usd)),
        vaultWithdraw: (usd) => demo(() => mockStore.vaultWithdraw(usd)),
        borrow: (usd) => demo(() => mockStore.borrow(usd)),
        repay: (usd) => demo(() => mockStore.repay(usd)),
        setAutoRepayPrincipal: async () => {},
        split: (seriesId, amount) => demo(() => mockStore.split(seriesId, amount)),
        merge: (seriesId, amount) => demo(() => mockStore.merge(seriesId, amount)),
        redeemPrincipal: (seriesId, amount) => demo(() => mockStore.redeemPrincipal(seriesId, amount)),
        claimYield: (seriesId) => demo(() => mockStore.claimSplitYield(seriesId)),
        sellYield: async () => {},
        freezeSeries: async () => {},
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
      canFaucet: hasFaucets,
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
        const base = resolveAmount(toStockBase(shares), walletBalances.data?.stocks[token]);
        if (base === 0n) throw new Error(`No ${symbol} in this wallet to deposit`);
        const txs = [buildApprove(token, d.dripCore, base, symbol), buildDeposit(d, token, base, symbol)];
        if (mode) txs.push(buildSetMode(d, token, MODE_TO_CHAIN[mode], symbol));
        await run(txs);
      },
      withdraw: async (symbol, shares) => {
        const d = need(deployment, "deployment");
        const token = need(addressOf(symbol), symbol);
        await run([buildWithdraw(d, token, toStockBase(shares), symbol)]);
      },
      redeemReward: async (usd) => {
        const d = need(deployment, "deployment");
        // Six decimals, like the USDG behind it. Rounding rather than flooring is safe
        // here because the vault holds the backing for every token it minted.
        await run([buildRewardRedeem(d, BigInt(Math.round(usd * 1e6)))]);
      },
      faucet: async (symbol) => {
        if (!hasFaucets) throw new Error("This network uses real stock tokens; there is no faucet.");
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
      borrow: async (usd) => {
        const d = need(deployment, "deployment");
        await run([buildBorrow(d, BigInt(Math.round(usd * 1e6)))]);
      },
      repay: async (usd) => {
        const d = need(deployment, "deployment");
        const owner = need(address, "wallet");
        const base = BigInt(Math.round(usd * 1e6));
        await run([buildApprove(d.usdg, need(d.lendingPool, "lending pool"), base, "USDG"), buildRepay(d, owner, base)]);
      },
      setAutoRepayPrincipal: async (enabled) => {
        const d = need(deployment, "deployment");
        await run([buildSetAutoRepayPrincipal(d, enabled)]);
      },
      split: async (seriesId, amount) => {
        const d = need(deployment, "deployment");
        const vault = need(d.splitVault, "split vault");
        const symbol = seriesSymbol(seriesId);
        const token = need(addressOf(symbol), symbol);
        const base = toStockBase(amount);

        // Split needs the stock in the wallet, and most of a holder's stock is on
        // deposit earning rewards. Making them go to the dashboard, withdraw, come
        // back and start again is a round trip that teaches nobody anything, so the
        // withdrawal is prepended to the same batch instead. Only ever the shortfall:
        // a holder with enough in the wallet never touches their deposit.
        const inWallet = walletBalances.data?.stocks[token] ?? 0n;
        const txs = [];
        if (base > inWallet) {
          const onDeposit = (positions.data ?? []).find(
            (x) => x.stockToken.toLowerCase() === token.toLowerCase()
          )?.amount ?? 0n;
          const shortfall = base - inWallet;
          if (shortfall > onDeposit) {
            throw new Error(
              `Not enough ${symbol}: ${Number(inWallet) / STOCK} in your wallet and ${Number(onDeposit) / STOCK} on deposit`
            );
          }
          txs.push(buildWithdraw(d, token, shortfall, symbol));
        }
        txs.push(buildApprove(token, vault, base, symbol), buildSplit(d, BigInt(seriesId), base, symbol));
        await run(txs);
      },
      merge: async (seriesId, amount) => {
        const d = need(deployment, "deployment");
        // Merging burns both halves; the vault holds the stock already, so there is
        // nothing to approve.
        await run([buildMerge(d, BigInt(seriesId), toStockBase(amount), seriesSymbol(seriesId))]);
      },
      redeemPrincipal: async (seriesId, amount) => {
        const d = need(deployment, "deployment");
        await run([buildRedeemPrincipal(d, BigInt(seriesId), toStockBase(amount), seriesSymbol(seriesId))]);
      },
      claimYield: async (seriesId) => {
        const d = need(deployment, "deployment");
        await run([buildClaimYield(d, BigInt(seriesId), seriesSymbol(seriesId))]);
      },
      sellYield: async (seriesId, amount, minUsdOut) => {
        const d = need(deployment, "deployment");
        const market = need(d.yieldMarket, "yield market");
        const series = (seriesList.data ?? []).find((x) => Number(x.seriesId) === seriesId);
        const yt = need(series?.yieldToken, "series");
        const base = toStockBase(amount);
        // Six decimals on the floor, and rounding DOWN: rounding up would set a
        // minimum the posted bid cannot meet and revert a sale that was fine.
        const floor = BigInt(Math.floor(minUsdOut * 1e6));
        await run([
          buildApprove(yt, market, base, "YT"),
          buildSellYield(d, BigInt(seriesId), base, floor, seriesSymbol(seriesId)),
        ]);
      },
      freezeSeries: async (seriesId) => {
        const d = need(deployment, "deployment");
        await run([buildFreezeSeries(d, BigInt(seriesId))]);
      },
    };
  }, [
    source,
    demoBusy,
    demo,
    state.status,
    deployment,
    address,
    addressOf,
    positions.data,
    walletBalances.data,
    seriesSymbol,
    run,
    walletBalances.data,
  ]);
}
