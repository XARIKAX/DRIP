import {
  streamClaimable,
  type CreditView,
  type ActivityRow,
  type DividendRow,
  type Holding,
  type ModeName,
  type PendingAdvance,
  type PortfolioSummary,
  type SplitDividendRow,
  type SplitPosition,
  type SplitSeries,
  type StreamRow,
  type TokenInfo,
  type VaultView,
  type WalletBalances,
} from "./types";

/**
 * The demo portfolio. Seeded, deterministic, and alive.
 *
 * This store is the app's default data source. A visitor with no wallet lands on a
 * complete working product: five positions, two streams accruing by the wall clock,
 * a pending advance waiting to be started, three weeks of history, a funded vault.
 * Every action mutates this store and every page reads from it, so the numbers
 * agree everywhere. State lives for the browser session and nothing more.
 *
 * The demo IS the marketing. Most visitors never connect. They still leave having
 * watched a dividend accrue per second and become stock.
 */

/** Deterministic PRNG so sparklines and history are identical on every load. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function walk(seed: number, points: number, drift: number, vol: number): number[] {
  const rnd = mulberry32(seed);
  const out: number[] = [1];
  for (let i = 1; i < points; i++) {
    out.push(out[i - 1]! * (1 + drift + (rnd() - 0.5) * vol));
  }
  return out;
}

const DAY = 86_400;
const now = () => Math.floor(Date.now() / 1000);

/** Anchored once per session so relative dates hold still while streams move. */
const BOOT = now();

interface TokenSeed {
  symbol: string;
  name: string;
  priceUsd: number;
  yieldPct: number;
  perShare: number;
  seed: number;
}

const TOKENS: TokenSeed[] = [
  // The 15 enabled tokens from contracts/listings/4663.json. SPCX exists in the
  // listing file but is disabled there (never traded, private-company feed), so it
  // never appears here. Quarterly per share amounts are zero for the non payers.
  { symbol: "NVDA", name: "NVIDIA Corp", priceUsd: 176.67, yieldPct: 0.02, perShare: 0.01, seed: 11 },
  { symbol: "TSLA", name: "Tesla Inc", priceUsd: 329.5, yieldPct: 0, perShare: 0, seed: 12 },
  { symbol: "AAPL", name: "Apple Inc", priceUsd: 230.1, yieldPct: 0.45, perShare: 0.26, seed: 13 },
  { symbol: "GOOGL", name: "Alphabet Inc", priceUsd: 201.4, yieldPct: 0.42, perShare: 0.21, seed: 14 },
  { symbol: "MSFT", name: "Microsoft Corp", priceUsd: 508.3, yieldPct: 0.65, perShare: 0.83, seed: 15 },
  { symbol: "AMZN", name: "Amazon.com Inc", priceUsd: 228.9, yieldPct: 0, perShare: 0, seed: 16 },
  { symbol: "META", name: "Meta Platforms", priceUsd: 748.6, yieldPct: 0.28, perShare: 0.525, seed: 17 },
  { symbol: "COIN", name: "Coinbase Global", priceUsd: 302.75, yieldPct: 0, perShare: 0, seed: 18 },
  { symbol: "ORCL", name: "Oracle Corp", priceUsd: 241.2, yieldPct: 0.83, perShare: 0.5, seed: 19 },
  { symbol: "PLTR", name: "Palantir Technologies", priceUsd: 154.8, yieldPct: 0, perShare: 0, seed: 20 },
  { symbol: "CRWV", name: "CoreWeave Inc", priceUsd: 118.4, yieldPct: 0, perShare: 0, seed: 21 },
  { symbol: "AMD", name: "Advanced Micro Devices", priceUsd: 168.3, yieldPct: 0, perShare: 0, seed: 22 },
  { symbol: "INTC", name: "Intel Corp", priceUsd: 24.15, yieldPct: 0, perShare: 0, seed: 23 },
  { symbol: "MU", name: "Micron Technology", priceUsd: 112.6, yieldPct: 0.41, perShare: 0.115, seed: 24 },
  { symbol: "SNDK", name: "SanDisk Corp", priceUsd: 54.2, yieldPct: 0, perShare: 0, seed: 25 },
];

interface MockState {
  holdings: Map<string, { amount: number; mode: ModeName }>;
  streams: StreamRow[];
  activity: ActivityRow[];
  dividends: DividendRow[];
  pending: PendingAdvance[];
  wallet: WalletBalances;
  credit: {
    borrowedUsd: number;
    /** When the current debt level was last changed, for the serviced counter. */
    sinceMs: number;
  };
  vault: {
    tvlUsd: number;
    advancesUsd: number;
    feesUsd: number;
    sharePrice: number;
    yourShares: number;
  };
  /** One active series per stock token, same constraint the real SplitVault enforces. */
  splitSeries: Map<number, { symbol: string; maturity: number; splitFeeBps: number; ptSupply: number; ytSupply: number }>;
  splitPositions: Map<number, { ptBalance: number; ytBalance: number }>;
  splitDividends: Map<string, { seriesId: number; dividendId: number; harvested: boolean; poolUsd: number; claimed: boolean }>;
  nextId: number;
}

type Listener = () => void;

class MockStore {
  private state: MockState;
  private listeners = new Set<Listener>();
  private version = 0;

  constructor() {
    this.state = this.seed();
  }

  // ------------------------------------------------------------------
  // Seed: the world as the visitor finds it
  // ------------------------------------------------------------------

  private seed(): MockState {
    const holdings = new Map<string, { amount: number; mode: ModeName }>([
      ["MSFT", { amount: 220, mode: "STREAM" }],
      ["AAPL", { amount: 150, mode: "REINVEST" }],
      ["NVDA", { amount: 160, mode: "CASH_EARLY" }],
      ["GOOGL", { amount: 120, mode: "REINVEST" }],
      ["META", { amount: 30, mode: "STREAM" }],
      ["ORCL", { amount: 40, mode: "REINVEST" }],
    ]);

    // Two live streams, mid flight. MSFT went ex six days ago, AAPL thirteen.
    const msftNet = 220 * 0.83 * 0.99; // net of the 1 percent advance fee
    const aaplNet = 150 * 0.26 * 0.99;
    const streams: StreamRow[] = [
      {
        id: 1,
        symbol: "MSFT",
        mode: "STREAM",
        totalUsd: msftNet,
        claimedBaseUsd: msftNet * (4 / 21), // claimed once, day 4
        baseTimeMs: 0, // derived below from the claim ratio
        ratePerSec: msftNet / (21 * DAY),
        start: BOOT - 6 * DAY,
        end: BOOT + 15 * DAY,
        closed: false,
      },
      {
        id: 2,
        symbol: "AAPL",
        mode: "REINVEST",
        totalUsd: aaplNet,
        claimedBaseUsd: aaplNet * (11 / 21), // last compounded on day 11
        baseTimeMs: 0,
        ratePerSec: aaplNet / (21 * DAY),
        start: BOOT - 13 * DAY,
        end: BOOT + 8 * DAY,
        closed: false,
      },
    ];
    // baseTimeMs is the moment claimedBaseUsd was true: derive from the claim ratio.
    for (const s of streams) {
      const claimedSeconds = s.claimedBaseUsd / s.ratePerSec;
      s.baseTimeMs = (s.start + claimedSeconds) * 1000;
    }

    // The calendar. Real payers only; ex dates staggered around today.
    const dividends: DividendRow[] = [
      { id: 101, symbol: "MSFT", perShare: 0.83, exDate: BOOT - 6 * DAY, payDate: BOOT + 15 * DAY, status: "DECLARED", daysEarly: 21 },
      { id: 102, symbol: "AAPL", perShare: 0.26, exDate: BOOT - 13 * DAY, payDate: BOOT + 8 * DAY, status: "DECLARED", daysEarly: 21 },
      { id: 103, symbol: "META", perShare: 0.525, exDate: BOOT - 1 * DAY, payDate: BOOT + 20 * DAY, status: "DECLARED", daysEarly: 21 },
      { id: 104, symbol: "GOOGL", perShare: 0.21, exDate: BOOT + 5 * DAY, payDate: BOOT + 26 * DAY, status: "DECLARED", daysEarly: 21 },
      { id: 105, symbol: "NVDA", perShare: 0.01, exDate: BOOT + 9 * DAY, payDate: BOOT + 30 * DAY, status: "DECLARED", daysEarly: 21 },
      { id: 106, symbol: "ORCL", perShare: 0.5, exDate: BOOT + 12 * DAY, payDate: BOOT + 36 * DAY, status: "DECLARED", daysEarly: 24 },
      { id: 107, symbol: "MU", perShare: 0.115, exDate: BOOT + 16 * DAY, payDate: BOOT + 37 * DAY, status: "DECLARED", daysEarly: 21 },
      { id: 108, symbol: "AAPL", perShare: 0.25, exDate: BOOT - 96 * DAY, payDate: BOOT - 75 * DAY, status: "SETTLED", daysEarly: 21 },
      { id: 109, symbol: "MSFT", perShare: 0.75, exDate: BOOT - 97 * DAY, payDate: BOOT - 76 * DAY, status: "SETTLED", daysEarly: 21 },
      { id: 110, symbol: "ORCL", perShare: 0.5, exDate: BOOT - 104 * DAY, payDate: BOOT - 83 * DAY, status: "SETTLED", daysEarly: 21 },
      // MU's split series: this one already went ex and is sitting there harvestable;
      // id 107 above is the same series' next one, still ahead of its own ex date.
      { id: 111, symbol: "MU", perShare: 0.115, exDate: BOOT - 4 * DAY, payDate: BOOT + 17 * DAY, status: "DECLARED", daysEarly: 21 },
    ];

    // META went ex yesterday and nobody has started it. That is the pending advance.
    const pending: PendingAdvance[] = [
      { dividendId: 103, symbol: "META", grossUsd: 30 * 0.525, exDate: BOOT - 1 * DAY, payDate: BOOT + 20 * DAY },
    ];

    // Three weeks of history, newest last. Amounts consistent with the positions.
    const a = (id: number, kind: ActivityRow["kind"], daysAgo: number, summary: string, amountUsd: number | null): ActivityRow => ({
      id, kind, summary, amountUsd, ts: BOOT - Math.floor(daysAgo * DAY),
    });
    const activity: ActivityRow[] = [
      a(1, "deposit", 21.2, "Deposited 220.0000 MSFT", 220 * 508.3),
      a(2, "deposit", 21.1, "Deposited 150.0000 AAPL", 150 * 230.1),
      a(3, "mode", 21.0, "AAPL set to Reinvest", null),
      a(4, "deposit", 20.4, "Deposited 120.0000 GOOGL", 120 * 201.4),
      a(5, "mode", 20.3, "GOOGL set to Reinvest", null),
      a(6, "deposit", 18.7, "Deposited 160.0000 NVDA", 160 * 176.67),
      a(7, "deposit", 16.2, "Deposited 30.0000 META", 30 * 748.6),
      a(8, "deposit", 15.8, "Deposited 40.0000 ORCL", 40 * 241.2),
      a(9, "advance", 13.0, "AAPL dividend paid early, on its ex date", aaplNet),
      a(10, "reinvest", 11.0, "Bought 0.0879 AAPL with 20.22 USDG of dividends", 20.22),
      a(11, "advance", 6.0, "MSFT dividend paid early, on its ex date", msftNet),
      a(12, "claim", 2.0, "Collected 34.43 USDG of MSFT dividends", 34.43),
      a(13, "mode", 1.4, "NVDA set to Cash early", null),
    ];

    return {
      holdings,
      streams,
      activity,
      dividends,
      pending,
      wallet: {
        usdg: 2_500,
        stocks: {
          NVDA: 25, TSLA: 12, AAPL: 20, GOOGL: 15, MSFT: 10, AMZN: 10, META: 4, COIN: 3,
          ORCL: 8, PLTR: 20, CRWV: 15, AMD: 10, INTC: 100, MU: 15, SNDK: 30,
        },
      },
      credit: {
        // The demo wallet already runs a modest line against its collateral, so the
        // carry math is visible the moment the page opens.
        borrowedUsd: 15_000,
        sinceMs: (BOOT - 9 * DAY) * 1000,
      },
      vault: {
        tvlUsd: 2_841_000,
        advancesUsd: 1_739_000,
        feesUsd: 41_260,
        sharePrice: 1.0261,
        yourShares: 0,
      },
      // One MU series, already open: 25 already split (out of 40 MU originally
      // held — 15 still sit spare in the wallet, ready to split live), a
      // maturity three months out, and a dividend that already went ex and is
      // sitting there harvestable, so the demo opens mid mechanism rather than
      // at an empty state.
      splitSeries: new Map([[1, { symbol: "MU", maturity: BOOT + 90 * DAY, splitFeeBps: 10, ptSupply: 25, ytSupply: 25 }]]),
      splitPositions: new Map([[1, { ptBalance: 25, ytBalance: 25 }]]),
      splitDividends: new Map(),
      nextId: 200,
    };
  }

  // ------------------------------------------------------------------
  // Subscription
  // ------------------------------------------------------------------

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = (): number => this.version;

  private emit() {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  private nextId(): number {
    return this.state.nextId++;
  }

  private log(kind: ActivityRow["kind"], summary: string, amountUsd: number | null) {
    this.state.activity.push({ id: this.nextId(), kind, summary, amountUsd, ts: now() });
  }

  // ------------------------------------------------------------------
  // Reads
  // ------------------------------------------------------------------

  tokens(): TokenInfo[] {
    return TOKENS.map((t) => {
      const next = this.state.dividends
        .filter((d) => d.symbol === t.symbol && d.status === "DECLARED" && d.exDate > now())
        .sort((x, y) => x.exDate - y.exDate)[0];
      const payingNow = this.state.dividends.some(
        (d) => d.symbol === t.symbol && d.status === "DECLARED" && d.exDate <= now() && d.payDate > now()
      );
      return {
        symbol: t.symbol,
        name: t.name,
        priceUsd: t.priceUsd,
        yieldPct: t.yieldPct,
        perShare: t.perShare,
        nextExDate: next ? next.exDate : null,
        payingNow,
      };
    });
  }

  token(symbol: string): TokenSeed | undefined {
    return TOKENS.find((t) => t.symbol === symbol);
  }

  holdings(): Holding[] {
    const out: Holding[] = [];
    for (const [symbol, h] of this.state.holdings) {
      if (h.amount <= 0) continue;
      const t = this.token(symbol)!;
      const spark = walk(t.seed + 1, 60, 0.0004, 0.007);
      const movePct = (spark[spark.length - 1]! / spark[0]! - 1) * 100;
      out.push({ symbol, amount: h.amount, valueUsd: h.amount * t.priceUsd, mode: h.mode, movePct, spark });
    }
    return out.sort((x, y) => y.valueUsd - x.valueUsd);
  }

  streams(): StreamRow[] {
    return [...this.state.streams].sort((x, y) => Number(x.closed) - Number(y.closed) || y.id - x.id);
  }

  activity(): ActivityRow[] {
    return [...this.state.activity].sort((x, y) => y.ts - x.ts);
  }

  calendar(): DividendRow[] {
    return [...this.state.dividends].sort((x, y) => x.exDate - y.exDate);
  }

  pendingAdvances(): PendingAdvance[] {
    return [...this.state.pending];
  }

  wallet(): WalletBalances {
    return { usdg: this.state.wallet.usdg, stocks: { ...this.state.wallet.stocks } };
  }

  vault(): VaultView {
    const v = this.state.vault;
    const utilization = (v.advancesUsd / v.tvlUsd) * 100;
    const history = walk(77, 90, 0.005, 0.03).map((x) => 4.1 * x);
    const yourAssets = v.yourShares * v.sharePrice;
    return {
      tvlUsd: v.tvlUsd,
      apyPct: history[history.length - 1]!,
      utilizationPct: utilization,
      capPct: 80,
      advancesOutstandingUsd: v.advancesUsd,
      feesEarnedUsd: v.feesUsd,
      sharePrice: v.sharePrice,
      freeLiquidityUsd: v.tvlUsd - v.advancesUsd,
      yourShares: v.yourShares,
      yourAssetsUsd: yourAssets,
      maxWithdrawUsd: Math.min(yourAssets, v.tvlUsd - v.advancesUsd),
      apyHistory: history,
    };
  }

  /** Lending parameters for the demo market. Conservative on purpose. */
  private static readonly MAX_LTV = 0.40;
  private static readonly LIQ_THRESHOLD = 0.65;
  private static readonly BORROW_APR = 0.058;

  credit(): CreditView {
    const collateral = this.holdings().reduce((sum, h) => sum + h.valueUsd, 0);
    const dividendsPerYear = this.holdings().reduce((sum, h) => {
      const t = this.token(h.symbol);
      return sum + (t ? h.amount * t.perShare * 4 : 0);
    }, 0);
    const borrowed = this.state.credit.borrowedUsd;
    const maxBorrow = collateral * MockStore.MAX_LTV;
    const interestPerYear = borrowed * MockStore.BORROW_APR;
    const servicedPerSec = Math.min(dividendsPerYear, interestPerYear) / (365 * DAY);
    return {
      collateralValueUsd: collateral,
      maxBorrowUsd: maxBorrow,
      borrowedUsd: borrowed,
      availableUsd: Math.max(maxBorrow - borrowed, 0),
      healthFactor: borrowed > 0 ? (collateral * MockStore.LIQ_THRESHOLD) / borrowed : Infinity,
      maxLtvPct: MockStore.MAX_LTV * 100,
      liqThresholdPct: MockStore.LIQ_THRESHOLD * 100,
      borrowAprPct: MockStore.BORROW_APR * 100,
      dividendsPerYearUsd: dividendsPerYear,
      interestPerYearUsd: interestPerYear,
      netCarryPerYearUsd: dividendsPerYear - interestPerYear,
      servicedBaseUsd: servicedPerSec * ((Date.now() - this.state.credit.sinceMs) / 1000),
      servicedRatePerSec: servicedPerSec,
    };
  }

  borrow(usd: number): void {
    const c = this.credit();
    const amount = Math.min(usd, c.availableUsd);
    if (amount <= 0) return;
    this.state.credit.borrowedUsd += amount;
    this.state.credit.sinceMs = Date.now();
    this.state.wallet.usdg += amount;
    this.log("borrow", `Borrowed ${amount.toFixed(2)} USDG against your stock`, amount);
    this.emit();
  }

  repay(usd: number): void {
    const amount = Math.min(usd, this.state.credit.borrowedUsd, this.state.wallet.usdg);
    if (amount <= 0) return;
    this.state.credit.borrowedUsd -= amount;
    this.state.credit.sinceMs = Date.now();
    this.state.wallet.usdg -= amount;
    this.log("repay", `Repaid ${amount.toFixed(2)} USDG of the loan`, amount);
    this.emit();
  }

  // ------------------------------------------------------------------
  // Split. The one module that wraps the share.
  // ------------------------------------------------------------------

  splitSeriesList(): SplitSeries[] {
    return [...this.state.splitSeries.entries()].map(([seriesId, s]) => {
      const t = this.token(s.symbol)!;
      return {
        seriesId,
        symbol: s.symbol,
        name: t.name,
        maturity: s.maturity,
        splitFeeBps: s.splitFeeBps,
        ptSupply: s.ptSupply,
        ytSupply: s.ytSupply,
        underlyingPriceUsd: t.priceUsd,
        // No secondary market in the demo to price the YT against, so the implied
        // rate is the same annualised-yield math the rest of the app already uses
        // for a stock's own yield — the honest number in the absence of a real one.
        impliedYieldApr: t.priceUsd > 0 ? ((t.perShare * 4) / t.priceUsd) * 100 : 0,
      };
    });
  }

  splitPosition(seriesId: number): SplitPosition | null {
    const p = this.state.splitPositions.get(seriesId);
    if (!p) return null;
    return { seriesId, ptBalance: p.ptBalance, ytBalance: p.ytBalance };
  }

  splitDividendRows(seriesId: number): SplitDividendRow[] {
    const series = this.state.splitSeries.get(seriesId);
    if (!series) return [];
    return this.state.dividends
      .filter((d) => d.symbol === series.symbol)
      .map((d) => {
        const key = `${seriesId}:${d.id}`;
        const h = this.state.splitDividends.get(key);
        const position = this.state.splitPositions.get(seriesId);
        const ytShare =
          h && h.harvested && series.ytSupply > 0 && position
            ? (h.poolUsd * position.ytBalance) / series.ytSupply
            : 0;
        return {
          seriesId,
          dividendId: d.id,
          symbol: d.symbol,
          perShare: d.perShare,
          exDate: d.exDate,
          harvested: h?.harvested ?? false,
          poolUsd: h?.poolUsd ?? 0,
          claimableUsd: h?.claimed ? 0 : ytShare,
          claimed: h?.claimed ?? false,
        };
      })
      .sort((a, b) => b.exDate - a.exDate);
  }

  /** Wallet stock still spare to split, same balance the deposit page reads from. */
  splitWalletBalance(symbol: string): number {
    return this.state.wallet.stocks[symbol] ?? 0;
  }

  split(seriesId: number, amount: number): void {
    const series = this.state.splitSeries.get(seriesId);
    const position = this.state.splitPositions.get(seriesId);
    if (!series || !position) return;
    if (now() >= series.maturity) return; // matches SplitVault.AlreadyMatured
    const spare = this.state.wallet.stocks[series.symbol] ?? 0;
    const draw = Math.min(amount, spare);
    if (draw <= 0) return;

    const fee = (draw * series.splitFeeBps) / 10_000;
    const minted = draw - fee;

    this.state.wallet.stocks[series.symbol] = spare - draw;
    position.ptBalance += minted;
    position.ytBalance += minted;
    series.ptSupply += minted;
    series.ytSupply += minted;

    this.log("split", `Split ${draw.toFixed(4)} ${series.symbol} into ${minted.toFixed(4)} share tokens and ${minted.toFixed(4)} dividend tokens`, null);
    this.emit();
  }

  merge(seriesId: number, amount: number): void {
    const series = this.state.splitSeries.get(seriesId);
    const position = this.state.splitPositions.get(seriesId);
    if (!series || !position) return;
    const draw = Math.min(amount, position.ptBalance, position.ytBalance);
    if (draw <= 0) return;

    position.ptBalance -= draw;
    position.ytBalance -= draw;
    series.ptSupply -= draw;
    series.ytSupply -= draw;
    this.state.wallet.stocks[series.symbol] = (this.state.wallet.stocks[series.symbol] ?? 0) + draw;

    this.log("merge", `Rejoined ${draw.toFixed(4)} pairs of tokens into ${draw.toFixed(4)} ${series.symbol}`, null);
    this.emit();
  }

  redeemPrincipal(seriesId: number, amount: number): void {
    const series = this.state.splitSeries.get(seriesId);
    const position = this.state.splitPositions.get(seriesId);
    if (!series || !position) return;
    if (now() < series.maturity) return; // matches SplitVault.NotMatured
    const draw = Math.min(amount, position.ptBalance);
    if (draw <= 0) return;

    position.ptBalance -= draw;
    series.ptSupply -= draw;
    this.state.wallet.stocks[series.symbol] = (this.state.wallet.stocks[series.symbol] ?? 0) + draw;

    this.log("withdraw", `Cashed in ${draw.toFixed(4)} share tokens for ${draw.toFixed(4)} ${series.symbol}`, null);
    this.emit();
  }

  harvestDividend(seriesId: number, dividendId: number): void {
    const series = this.state.splitSeries.get(seriesId);
    const div = this.state.dividends.find((d) => d.id === dividendId);
    if (!series || !div || div.symbol !== series.symbol) return;
    if (div.exDate > now()) return; // matches SplitVault harvesting before its own ex date
    const key = `${seriesId}:${dividendId}`;
    if (this.state.splitDividends.get(key)?.harvested) return;

    // The vault's own CASH_EARLY entitlement, minus AdvanceVault's one percent —
    // the same fee every other Early holder pays, because this series is just
    // another CASH_EARLY position from DripCore's point of view.
    const gross = series.ptSupply * div.perShare;
    const poolUsd = gross * 0.99;

    this.state.splitDividends.set(key, { seriesId, dividendId, harvested: true, poolUsd, claimed: false });
    this.log("harvest", `Collected the ${series.symbol} dividend for dividend token holders: ${poolUsd.toFixed(2)} USDG`, poolUsd);
    this.emit();
  }

  claimYield(seriesId: number, dividendId: number): void {
    const rows = this.splitDividendRows(seriesId);
    const row = rows.find((r) => r.dividendId === dividendId);
    if (!row || !row.harvested || row.claimed || row.claimableUsd <= 0) return;

    const key = `${seriesId}:${dividendId}`;
    const h = this.state.splitDividends.get(key)!;
    h.claimed = true;
    this.state.wallet.usdg += row.claimableUsd;

    this.log("claim_yield", `Took ${row.claimableUsd.toFixed(2)} USDG of ${row.symbol} dividends`, row.claimableUsd);
    this.emit();
  }

  summary(): PortfolioSummary {
    const nowMs = Date.now();
    let value = 0;
    for (const h of this.holdings()) value += h.valueUsd;
    let rate = 0;
    for (const s of this.state.streams) {
      if (!s.closed && nowMs >= s.start * 1000 && nowMs < s.end * 1000) rate += s.ratePerSec;
      value += streamClaimable(s, nowMs);
    }
    const weekAgo = now() - 7 * DAY;
    let earned = 0;
    for (const row of this.state.activity) {
      if (row.ts >= weekAgo && (row.kind === "claim" || row.kind === "reinvest" || row.kind === "advance") && row.amountUsd) {
        earned += row.amountUsd;
      }
    }
    // Streams accrue whether or not they have been claimed. Count the last week's drip.
    for (const s of this.state.streams) {
      const from = Math.max(s.start, weekAgo);
      const to = Math.min(s.end, now());
      if (to > from) earned += s.ratePerSec * (to - from) * 0.35; // portion not already in claims above
    }
    const nextDiv = this.state.dividends
      .filter((d) => d.status === "DECLARED" && d.exDate > now())
      .sort((x, y) => x.exDate - y.exDate)[0];
    return {
      valueUsd: value,
      streamRatePerSec: rate,
      earnedThisWeekUsd: earned,
      activeRules: [...this.state.holdings.values()].filter((h) => h.amount > 0).length,
      nextDividend: nextDiv ? { symbol: nextDiv.symbol, exDate: nextDiv.exDate } : null,
    };
  }

  // ------------------------------------------------------------------
  // Actions. Every one succeeds instantly: this is the demo.
  // ------------------------------------------------------------------

  setMode(symbol: string, mode: ModeName): void {
    const h = this.state.holdings.get(symbol) ?? { amount: 0, mode };
    h.mode = mode;
    this.state.holdings.set(symbol, h);
    this.log("mode", `${symbol} set to ${mode === "CASH_EARLY" ? "Cash early" : mode === "STREAM" ? "Stream" : "Reinvest"}`, null);
    this.emit();
  }

  claimStream(id: number): { claimedUsd: number; reinvested: boolean; shares: number } {
    const s = this.state.streams.find((x) => x.id === id);
    if (!s || s.closed) return { claimedUsd: 0, reinvested: false, shares: 0 };
    const nowMs = Date.now();
    const amount = streamClaimable(s, nowMs);
    if (amount <= 0) return { claimedUsd: 0, reinvested: false, shares: 0 };

    s.claimedBaseUsd += amount;
    s.baseTimeMs = nowMs;
    if (s.claimedBaseUsd >= s.totalUsd - 1e-9 && nowMs >= s.end * 1000) s.closed = true;

    const t = this.token(s.symbol)!;
    if (s.mode === "REINVEST") {
      const shares = amount / t.priceUsd;
      const h = this.state.holdings.get(s.symbol) ?? { amount: 0, mode: "REINVEST" as ModeName };
      h.amount += shares;
      this.state.holdings.set(s.symbol, h);
      this.log("reinvest", `Bought ${shares.toFixed(4)} ${s.symbol} with ${amount.toFixed(2)} USDG of dividends`, amount);
      this.emit();
      return { claimedUsd: amount, reinvested: true, shares };
    }

    this.state.wallet.usdg += amount;
    this.log("claim", `Collected ${amount.toFixed(2)} USDG of ${s.symbol} dividends`, amount);
    this.emit();
    return { claimedUsd: amount, reinvested: false, shares: 0 };
  }

  startPending(dividendId: number): void {
    const idx = this.state.pending.findIndex((p) => p.dividendId === dividendId);
    if (idx < 0) return;
    const p = this.state.pending[idx]!;
    this.state.pending.splice(idx, 1);

    const mode = this.state.holdings.get(p.symbol)?.mode ?? "STREAM";
    const net = p.grossUsd * 0.99;
    this.log("advance", `${p.symbol} dividend paid early, on its ex date`, net);

    if (mode === "CASH_EARLY") {
      this.state.wallet.usdg += net;
      this.log("claim", `Paid ${net.toFixed(2)} USDG early for ${p.symbol}`, net);
    } else {
      this.state.streams.push({
        id: this.nextId(),
        symbol: p.symbol,
        mode,
        totalUsd: net,
        claimedBaseUsd: 0,
        baseTimeMs: Date.now(),
        ratePerSec: net / Math.max(p.payDate - now(), 1),
        start: now(),
        end: p.payDate,
        closed: false,
      });
    }
    this.emit();
  }

  deposit(symbol: string, shares: number): void {
    const t = this.token(symbol);
    if (!t || shares <= 0) return;
    const available = this.state.wallet.stocks[symbol] ?? 0;
    const amount = Math.min(shares, available);
    if (amount <= 0) return;
    this.state.wallet.stocks[symbol] = available - amount;
    const h = this.state.holdings.get(symbol) ?? { amount: 0, mode: "STREAM" as ModeName };
    h.amount += amount;
    this.state.holdings.set(symbol, h);
    this.log("deposit", `Deposited ${amount.toFixed(4)} ${symbol}`, amount * t.priceUsd);
    this.emit();
  }

  withdraw(symbol: string, shares: number): void {
    const t = this.token(symbol);
    const h = this.state.holdings.get(symbol);
    if (!t || !h || shares <= 0) return;
    const amount = Math.min(shares, h.amount);
    if (amount <= 0) return;
    h.amount -= amount;
    this.state.wallet.stocks[symbol] = (this.state.wallet.stocks[symbol] ?? 0) + amount;
    this.log("withdraw", `Withdrew ${amount.toFixed(4)} ${symbol}`, amount * t.priceUsd);
    this.emit();
  }

  faucet(symbol: string): void {
    this.state.wallet.stocks[symbol] = (this.state.wallet.stocks[symbol] ?? 0) + 100;
    this.log("deposit", `Faucet minted 100.0000 test ${symbol}`, null);
    this.emit();
  }

  vaultDeposit(usd: number): void {
    const amount = Math.min(usd, this.state.wallet.usdg);
    if (amount <= 0) return;
    this.state.wallet.usdg -= amount;
    this.state.vault.tvlUsd += amount;
    this.state.vault.yourShares += amount / this.state.vault.sharePrice;
    this.log("vault", `Put ${amount.toFixed(2)} USDG into the pool`, amount);
    this.emit();
  }

  vaultWithdraw(usd: number): void {
    const v = this.state.vault;
    const max = Math.min(v.yourShares * v.sharePrice, v.tvlUsd - v.advancesUsd);
    const amount = Math.min(usd, max);
    if (amount <= 0) return;
    v.yourShares -= amount / v.sharePrice;
    v.tvlUsd -= amount;
    this.state.wallet.usdg += amount;
    this.log("vault", `Took ${amount.toFixed(2)} USDG out of the pool`, amount);
    this.emit();
  }
}

/** One store per browser session. Every page reads the same numbers. */
export const mockStore = new MockStore();
