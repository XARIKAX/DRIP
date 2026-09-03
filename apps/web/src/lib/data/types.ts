/**
 * The view models every page renders from, and the provider interface that feeds
 * them. Two implementations exist: the seeded MockProvider (demo mode, default)
 * and the chain adapter (wallet connected against a deployed chain). Components
 * never know which one they are on. That single seam is what makes the app fully
 * browsable with no wallet, ever.
 *
 * Values are plain USD / share numbers, not bigints: these are display models.
 * The chain adapter owns the base-unit conversions.
 */

export type ModeName = "CASH_EARLY" | "STREAM" | "REINVEST";

export const MODE_LABEL: Record<ModeName, string> = {
  CASH_EARLY: "Cash early",
  STREAM: "Stream",
  REINVEST: "Reinvest",
};

export const MODE_SENTENCE: Record<ModeName, string> = {
  CASH_EARLY: "The whole dividend hits your wallet at the ex date, weeks before the issuer pays.",
  STREAM: "The dividend drips into your wallet per second from the ex date to the pay date.",
  REINVEST: "The dividend drips in and buys more of the same stock the moment it lands.",
};

export interface TokenInfo {
  symbol: string;
  name: string;
  priceUsd: number;
  /** Trailing dividend yield, percent. */
  yieldPct: number;
  /** Quarterly dividend per share in USD. */
  perShare: number;
  /** Next ex date, unix seconds, or null when nothing is scheduled. */
  nextExDate: number | null;
  /** True while a declared dividend is between its ex date and pay date. */
  payingNow: boolean;
}

export interface Holding {
  symbol: string;
  /** Shares on deposit. */
  amount: number;
  valueUsd: number;
  mode: ModeName;
  /** Percent move today. */
  movePct: number;
  /** 60 point intraday walk for the inline sparkline, oldest first. */
  spark: number[];
}

export interface StreamRow {
  id: number;
  symbol: string;
  mode: ModeName;
  /** Total USD the stream pays over its life. */
  totalUsd: number;
  /** USD claimed as of `baseTime`. Live accrual is base + rate * elapsed. */
  claimedBaseUsd: number;
  /** Unix ms when claimedBaseUsd was last true. */
  baseTimeMs: number;
  /** USD per second. */
  ratePerSec: number;
  /** Unix seconds. */
  start: number;
  end: number;
  closed: boolean;
}

/** Live accrued-but-unclaimed USD for a stream. */
export function streamClaimable(s: StreamRow, nowMs: number): number {
  if (s.closed) return 0;
  const startMs = s.start * 1000;
  const endMs = s.end * 1000;
  const at = Math.min(Math.max(nowMs, startMs), endMs);
  const accrued = Math.min(s.ratePerSec * ((at - startMs) / 1000), s.totalUsd);
  return Math.max(accrued - s.claimedBaseUsd, 0);
}

export type ActivityKind =
  | "deposit"
  | "withdraw"
  | "advance"
  | "claim"
  | "reinvest"
  | "mode"
  | "vault"
  | "borrow"
  | "repay"
  | "settle"
  | "split"
  | "merge"
  | "harvest"
  | "claim_yield";

export interface ActivityRow {
  id: number;
  kind: ActivityKind;
  /** One line, already written for humans. */
  summary: string;
  /** Signed USD amount when one applies. */
  amountUsd: number | null;
  /** Unix seconds. */
  ts: number;
}

export type DividendStatusName = "DECLARED" | "SETTLED" | "VOIDED";

export interface DividendRow {
  id: number;
  symbol: string;
  perShare: number;
  exDate: number;
  payDate: number;
  status: DividendStatusName;
  /** Days between ex and pay. The days you gain. This column is the product. */
  daysEarly: number;
}

export interface VaultView {
  tvlUsd: number;
  apyPct: number;
  utilizationPct: number;
  capPct: number;
  advancesOutstandingUsd: number;
  feesEarnedUsd: number;
  sharePrice: number;
  freeLiquidityUsd: number;
  yourShares: number;
  yourAssetsUsd: number;
  maxWithdrawUsd: number;
  /** 90 daily APY points, oldest first. */
  apyHistory: number[];
}

export interface PendingAdvance {
  dividendId: number;
  symbol: string;
  grossUsd: number;
  exDate: number;
  payDate: number;
}

export interface WalletBalances {
  usdg: number;
  /** symbol -> shares held in the wallet, outside the protocol. */
  stocks: Record<string, number>;
}

/**
 * The credit side. Stocks are the collateral, dividends are the repayment engine:
 * the yield the collateral earns services the interest on what you borrowed.
 * Positive net carry means the dividends out-earn the interest.
 */
export interface CreditView {
  /** USD value of everything on deposit. */
  collateralValueUsd: number;
  /** Hard borrow cap: collateral times the max LTV. */
  maxBorrowUsd: number;
  borrowedUsd: number;
  /** Still available to draw. */
  availableUsd: number;
  /** collateral x liquidation threshold / debt. Infinity when nothing is borrowed. */
  healthFactor: number;
  maxLtvPct: number;
  liqThresholdPct: number;
  borrowAprPct: number;
  /** What the collateral's dividends earn per year, in USD. */
  dividendsPerYearUsd: number;
  /** What the current debt costs per year, in USD. */
  interestPerYearUsd: number;
  /** dividendsPerYearUsd minus interestPerYearUsd. The whole thesis in one number. */
  netCarryPerYearUsd: number;
  /** Interest serviced by dividends since the loan opened, live. */
  servicedBaseUsd: number;
  servicedRatePerSec: number;
}

export interface PortfolioSummary {
  valueUsd: number;
  /** Combined per second accrual across open streams, for live interpolation. */
  streamRatePerSec: number;
  earnedThisWeekUsd: number;
  activeRules: number;
  nextDividend: { symbol: string; exDate: number } | null;
}

/**
 * The Split side. The one module that wraps the share: deposit stock, receive a
 * Principal Token (the share, minus the drip — redeemable 1:1 for the stock at
 * maturity) and a Yield Token (the drip alone, tradable on its own until then).
 * Early, Stream, Reinvest and Borrow never do this; Split is opt in, for holders
 * who specifically want the dividend itself to be a liquid position rather than a
 * stream or loan collateral.
 */
export interface SplitSeries {
  seriesId: number;
  symbol: string;
  name: string;
  maturity: number;
  splitFeeBps: number;
  /** Principal Token supply for this series, protocol wide. Backs 1:1 in custody. */
  ptSupply: number;
  ytSupply: number;
  underlyingPriceUsd: number;
  /** What the market is pricing the drip at, annualised, in the absence of a real AMM. */
  impliedYieldApr: number;
}

/** A holder's position in one series. */
export interface SplitPosition {
  seriesId: number;
  ptBalance: number;
  ytBalance: number;
}

/** A dividend on a split token's underlying, from the series' point of view. */
export interface SplitDividendRow {
  seriesId: number;
  dividendId: number;
  symbol: string;
  perShare: number;
  exDate: number;
  /** Set once anyone has pulled the entitlement into the series' yield pool. */
  harvested: boolean;
  /** The pool a harvest produced, split fee already taken at split time, advance
   *  fee already taken by the vault the way any CASH_EARLY holder's is. */
  poolUsd: number;
  /** This holder's pro rata share of the pool, by YT balance at the ex date. */
  claimableUsd: number;
  claimed: boolean;
}
