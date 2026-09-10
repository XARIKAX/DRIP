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
  CASH_EARLY: "Get the whole dividend the day you qualify, weeks before the company pays. Costs 1%.",
  STREAM: "The dividend drips into your wallet a little every second until pay day.",
  REINVEST: "The dividend drips in and buys more of the same stock as it lands.",
};

export interface TokenInfo {
  symbol: string;
  name: string;
  /**
   * Price in USD, or null when the oracle will not answer — a feed past its
   * heartbeat, most often. Not the same claim as zero: "we cannot price this right
   * now" and "this is worthless" are different sentences and the UI must not
   * conflate them, least of all on somebody's collateral.
   */
  priceUsd: number | null;
  /**
   * The reward figure shown against this stock, as a percentage.
   *
   * Two different claims share this field, and `yieldRealised` says which one it is:
   * once anything has been distributed it is what a dollar in this stock HAS been
   * paid, cumulative and realised; before that it is the rate Osinko is TARGETING.
   * The UI must label them differently. A target read as a fact is the direction that
   * misleads somebody into depositing.
   */
  yieldPct: number | null;
  /** True when `yieldPct` is money already paid, false when it is the target rate. */
  yieldRealised: boolean;
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
  /** Null when the underlying cannot be priced. See TokenInfo.priceUsd. */
  valueUsd: number | null;
  mode: ModeName;
  /** Percent move today. */
  /** Today's move, or null on a chain with no intraday price history to read. */
  movePct: number | null;
  /** 60 point intraday walk for the inline sparkline, oldest first. */
  /** Intraday series for the sparkline. Empty when there is none to show. */
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
  /**
   * Holdings left out of valueUsd because their feed would not answer. Non-zero
   * means the total is a floor, not the whole portfolio, and the UI has to say so —
   * a number that silently shrinks when a feed goes quiet is worse than no number.
   */
  unpricedHoldings: number;
  /** Combined per second accrual across open streams, for live interpolation. */
  streamRatePerSec: number;
  earnedUsd: number;
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
  /** PT supply, in SHARES. What it redeems for is this over the multiplier. */
  ptSupply: number;
  /** YT supply, in RAW stock tokens. */
  ytSupply: number;
  /** Null when the underlying cannot be priced. See TokenInfo.priceUsd. */
  underlyingPriceUsd: number | null;
  /**
   * Shares one raw token is worth right now. 1.0 is a stock that has paid nothing
   * since launch; 1.0006 has paid 0.06%. This single number is the entire yield.
   */
  multiplier: number;
  /** The multiplier when this series opened. */
  startMultiplier: number;
  /** How much the underlying has accreted since the series opened, as a percentage. */
  earnedPct: number;
  /** True once the series matured and its yield clock stopped. */
  frozen: boolean;
  /** USDG the market pays for one whole YT. Zero means it is not buying. */
  ytBidUsd: number;
  /** USDG the market may still spend on this series. */
  ytBudgetUsd: number;
}

/** A holder's position in one series. */
export interface SplitPosition {
  seriesId: number;
  /** PT held, in shares. */
  ptBalance: number;
  /** YT held, in raw stock tokens. */
  ytBalance: number;
  /** Stock the PT would redeem for at today's multiplier. */
  principalStock: number;
  /** Stock the YT has already earned and can collect now. */
  claimableStock: number;
}

/** A dividend on a split token's underlying, from the series' point of view. */
export interface SplitDividendRow {
  seriesId: number;
  dividendId: number;
  symbol: string;
  perShare: number;
  exDate: number;
  /** False when the series held none of the stock at this dividend's ex date. */
  eligible: boolean;
  /** Set once anyone has pulled the entitlement into the series' yield pool. */
  harvested: boolean;
  /** The pool a harvest produced, split fee already taken at split time, advance
   *  fee already taken by the vault the way any CASH_EARLY holder's is. */
  poolUsd: number;
  /** This holder's pro rata share of the pool, by YT balance at the ex date. */
  claimableUsd: number;
  claimed: boolean;
}

/**
 * The reward programme, as the app sees it.
 *
 * Every YT is a dollar the vault is holding, so `yours` is both a balance and a
 * redeemable amount — there is no exchange rate to quote and no wait to explain.
 * Null means this deployment has no reward vault, which is different from one that
 * exists and is empty.
 */
export interface RewardView {
  /** YT this wallet holds, redeemable one for one for USDG. */
  yoursUsd: number;
  /** Everything THIS wallet has ever been paid, collected or not. */
  yourEarnedUsd: number;
  /** Everything THIS wallet has redeemed for USDG. */
  yourCollectedUsd: number;
  /**
   * False when the per wallet history could not be read, so the two figures above are
   * unknown rather than zero. The UI must not print a zero it cannot stand behind.
   */
  yourHistoryRead: boolean;
  /** YT in circulation across everyone. */
  outstandingUsd: number;
  /** USDG paid into the vault, cumulative. */
  fundedUsd: number;
  /** USDG holders have actually taken out, cumulative. */
  redeemedUsd: number;
  /** Funded USDG no YT has a claim on yet. */
  unallocatedUsd: number;
}

/**
 * The public scoreboard: how much stock the platform is holding and how much money
 * has actually reached holders. Null when this chain has no address book to read.
 *
 * `paidOutUsd` is deliberately only what has left the reward vault. Dividend advances
 * keep no cumulative counter onchain, so a figure that claimed to include them would
 * be a guess. When dividends go live here this needs an indexer behind it.
 */
export interface TrackerView {
  /** USDG value of the priced stock on deposit. */
  stockUsd: number;
  /** Tickers holding stock the oracle would not price, so `stockUsd` is a floor. */
  unpriced: string[];
  /** Per ticker, biggest first. `valueUsd` null means the feed is quiet. */
  rows: { symbol: string; amount: number; valueUsd: number | null }[];
  /** USDG holders have redeemed and taken away, cumulative. */
  paidOutUsd: number;
  /** YT outstanding: earned, redeemable, not yet taken. */
  owedUsd: number;
  /** USDG paid into the reward vault, cumulative. */
  fundedUsd: number;
}
