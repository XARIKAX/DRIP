import {
  streamClaimable,
  type ActivityRow,
  type DividendRow,
  type Holding,
  type ModeName,
  type PendingAdvance,
  type PortfolioSummary,
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
  { symbol: "AAPL", name: "Apple Inc", priceUsd: 220.44, yieldPct: 0.47, perShare: 0.26, seed: 11 },
  { symbol: "MSFT", name: "Microsoft Corp", priceUsd: 421.9, yieldPct: 0.79, perShare: 0.83, seed: 12 },
  { symbol: "NVDA", name: "NVIDIA Corp", priceUsd: 176.67, yieldPct: 0.02, perShare: 0.01, seed: 13 },
  { symbol: "KO", name: "Coca-Cola Co", priceUsd: 62.13, yieldPct: 3.29, perShare: 0.51, seed: 14 },
  { symbol: "JNJ", name: "Johnson & Johnson", priceUsd: 155.22, yieldPct: 3.35, perShare: 1.3, seed: 15 },
  { symbol: "PG", name: "Procter & Gamble", priceUsd: 168.7, yieldPct: 2.51, perShare: 1.06, seed: 16 },
  { symbol: "JPM", name: "JPMorgan Chase", priceUsd: 248.55, yieldPct: 2.01, perShare: 1.25, seed: 17 },
];

interface MockState {
  holdings: Map<string, { amount: number; mode: ModeName }>;
  streams: StreamRow[];
  activity: ActivityRow[];
  dividends: DividendRow[];
  pending: PendingAdvance[];
  wallet: WalletBalances;
  vault: {
    tvlUsd: number;
    advancesUsd: number;
    feesUsd: number;
    sharePrice: number;
    yourShares: number;
  };
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
      ["AAPL", { amount: 42.5, mode: "REINVEST" }],
      ["NVDA", { amount: 120, mode: "CASH_EARLY" }],
      ["KO", { amount: 420, mode: "STREAM" }],
      ["JNJ", { amount: 60, mode: "REINVEST" }],
      ["MSFT", { amount: 18.2, mode: "STREAM" }],
    ]);

    // Two live streams, mid flight. KO went ex six days ago, JNJ thirteen.
    const koTotal = 420 * 0.51; // 214.20
    const jnjTotal = 60 * 1.3 * 0.99; // net of the 1 percent advance fee
    const streams: StreamRow[] = [
      {
        id: 1,
        symbol: "KO",
        mode: "STREAM",
        totalUsd: koTotal * 0.99,
        claimedBaseUsd: (koTotal * 0.99) * (4 / 21), // claimed once, day 4
        baseTimeMs: (BOOT - 6 * DAY) * 1000 + 6 * DAY * 1000 * 0, // recomputed below
        ratePerSec: (koTotal * 0.99) / (21 * DAY),
        start: BOOT - 6 * DAY,
        end: BOOT + 15 * DAY,
        closed: false,
      },
      {
        id: 2,
        symbol: "JNJ",
        mode: "REINVEST",
        totalUsd: jnjTotal,
        claimedBaseUsd: jnjTotal * (11 / 21), // last compounded on day 11
        baseTimeMs: 0,
        ratePerSec: jnjTotal / (21 * DAY),
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

    // The calendar. Ex dates staggered around today; pay always ~3 weeks later.
    const dividends: DividendRow[] = [
      { id: 101, symbol: "KO", perShare: 0.51, exDate: BOOT - 6 * DAY, payDate: BOOT + 15 * DAY, status: "DECLARED", daysEarly: 21 },
      { id: 102, symbol: "JNJ", perShare: 1.3, exDate: BOOT - 13 * DAY, payDate: BOOT + 8 * DAY, status: "DECLARED", daysEarly: 21 },
      { id: 103, symbol: "MSFT", perShare: 0.83, exDate: BOOT - 1 * DAY, payDate: BOOT + 20 * DAY, status: "DECLARED", daysEarly: 21 },
      { id: 104, symbol: "AAPL", perShare: 0.26, exDate: BOOT + 5 * DAY, payDate: BOOT + 26 * DAY, status: "DECLARED", daysEarly: 21 },
      { id: 105, symbol: "NVDA", perShare: 0.01, exDate: BOOT + 9 * DAY, payDate: BOOT + 30 * DAY, status: "DECLARED", daysEarly: 21 },
      { id: 106, symbol: "PG", perShare: 1.06, exDate: BOOT + 12 * DAY, payDate: BOOT + 36 * DAY, status: "DECLARED", daysEarly: 24 },
      { id: 107, symbol: "JPM", perShare: 1.25, exDate: BOOT + 16 * DAY, payDate: BOOT + 37 * DAY, status: "DECLARED", daysEarly: 21 },
      { id: 108, symbol: "AAPL", perShare: 0.25, exDate: BOOT - 96 * DAY, payDate: BOOT - 75 * DAY, status: "SETTLED", daysEarly: 21 },
      { id: 109, symbol: "KO", perShare: 0.485, exDate: BOOT - 97 * DAY, payDate: BOOT - 76 * DAY, status: "SETTLED", daysEarly: 21 },
      { id: 110, symbol: "JNJ", perShare: 1.24, exDate: BOOT - 104 * DAY, payDate: BOOT - 83 * DAY, status: "SETTLED", daysEarly: 21 },
    ];

    // MSFT went ex yesterday and nobody has started it. That is the pending advance.
    const pending: PendingAdvance[] = [
      { dividendId: 103, symbol: "MSFT", grossUsd: 18.2 * 0.83, exDate: BOOT - 1 * DAY, payDate: BOOT + 20 * DAY },
    ];

    // Three weeks of history, newest last. Amounts consistent with the positions.
    const a = (id: number, kind: ActivityRow["kind"], daysAgo: number, summary: string, amountUsd: number | null): ActivityRow => ({
      id, kind, summary, amountUsd, ts: BOOT - Math.floor(daysAgo * DAY),
    });
    const activity: ActivityRow[] = [
      a(1, "deposit", 21.2, "Deposited 42.5000 AAPL", 42.5 * 220.44),
      a(2, "deposit", 21.1, "Deposited 420.0000 KO", 420 * 62.13),
      a(3, "mode", 21.0, "KO set to Stream", null),
      a(4, "deposit", 20.4, "Deposited 60.0000 JNJ", 60 * 155.22),
      a(5, "mode", 20.3, "JNJ set to Reinvest", null),
      a(6, "deposit", 18.7, "Deposited 120.0000 NVDA", 120 * 176.67),
      a(7, "deposit", 16.2, "Deposited 18.2000 MSFT", 18.2 * 421.9),
      a(8, "advance", 13.0, "JNJ dividend advanced at the ex date", 60 * 1.3 * 0.99),
      a(9, "reinvest", 11.0, "Compounded 40.85 USDG into 0.2632 JNJ", 40.85),
      a(10, "advance", 6.0, "KO dividend advanced at the ex date", koTotal * 0.99),
      a(11, "claim", 2.0, "Claimed 40.38 USDG from the KO stream", 40.38),
      a(12, "mode", 1.4, "NVDA set to Cash early", null),
    ];

    return {
      holdings,
      streams,
      activity,
      dividends,
      pending,
      wallet: {
        usdg: 2_500,
        stocks: { AAPL: 8, MSFT: 6, NVDA: 15, KO: 120, JNJ: 10, PG: 0, JPM: 0 },
      },
      vault: {
        tvlUsd: 2_841_000,
        advancesUsd: 1_739_000,
        feesUsd: 41_260,
        sharePrice: 1.0261,
        yourShares: 0,
      },
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
      this.log("reinvest", `Compounded ${amount.toFixed(2)} USDG into ${shares.toFixed(4)} ${s.symbol}`, amount);
      this.emit();
      return { claimedUsd: amount, reinvested: true, shares };
    }

    this.state.wallet.usdg += amount;
    this.log("claim", `Claimed ${amount.toFixed(2)} USDG from the ${s.symbol} stream`, amount);
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
    this.log("advance", `${p.symbol} dividend advanced at the ex date`, net);

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
    this.log("vault", `Deposited ${amount.toFixed(2)} USDG into the advance vault`, amount);
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
    this.log("vault", `Withdrew ${amount.toFixed(2)} USDG from the advance vault`, amount);
    this.emit();
  }
}

/** One store per browser session. Every page reads the same numbers. */
export const mockStore = new MockStore();
