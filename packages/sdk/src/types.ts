import type { Address, Hex } from "viem";

/**
 * What a holder wants done with a dividend entitlement.
 * The numbers are the on chain enum values. Do not reorder them.
 */
export enum Mode {
  CASH_EARLY = 0,
  STREAM = 1,
  REINVEST = 2,
}

/** Human labels, indexed by Mode. */
export const MODE_LABELS = ["Cash early", "Stream", "Reinvest"] as const;

/** One line each. Used verbatim in the deposit flow. */
export const MODE_DESCRIPTIONS = [
  "The whole dividend hits your wallet at the ex date, weeks before the issuer pays.",
  "The dividend drips into your wallet per second from the ex date to the pay date.",
  "The dividend drips in and buys more of the same stock the moment it lands.",
] as const;

/** Lifecycle of a declared dividend. Matches the on chain enum. */
export enum DividendStatus {
  NONE = 0,
  DECLARED = 1,
  SETTLED = 2,
  VOIDED = 3,
}

export const STATUS_LABELS = ["Unknown", "Declared", "Settled", "Voided"] as const;

/** The address book written by the deploy script, one per chain. */
export interface Deployment {
  chainId: number;
  /** Deploy block timestamp. Used to annualise vault fees into an APY. */
  deployedAt: number;
  /**
   * True when this chain runs the testnet stand ins: MockUSDG, MockStockToken and
   * MockSwapAdapter. Absent on books written before the field existed, which were all
   * testnet — hence the default in `usesMocks`, never a bare truthiness check.
   * The app hides its faucets when this is false; a real stock token has none.
   */
  mocks?: boolean;
  /** The multisig holding every role. Production books only. */
  admin?: Address;
  /** The price source the credit side values collateral with. */
  priceOracle?: Address;
  /** The credit market. Absent on books written before it existed; Borrow needs it. */
  lendingPool?: Address;
  usdg: Address;
  dividendRegistry: Address;
  advanceVault: Address;
  dripCore: Address;
  streamEngine: Address;
  reinvestor: Address;
  swapAdapter: Address;
  splitVault: Address;
  /**
   * The reward token vault. Optional because the protocol was deployed before it
   * existed, so a book written by that deploy is still valid and the app has to
   * render without one rather than throw.
   */
  rewardVault?: Address;
  /** Ticker to address. */
  tokens: Record<string, Address>;
  /** Ticker to USDG price of one whole token, 6 decimals. */
  prices: Record<string, number>;
}

/** The reward vault's state: what has been funded, handed out and taken. */
export interface RewardStats {
  /** YT in circulation. Every one is a USDG in the vault. */
  totalSupply: bigint;
  /** USDG paid in, cumulative. */
  totalFunded: bigint;
  /** YT redeemed for USDG, cumulative — what holders have actually taken. */
  totalRedeemed: bigint;
  /** USDG in the vault no YT has a claim on yet: what is left to hand out. */
  unallocated: bigint;
}

/** One holder's reward balance. */
export interface RewardPosition {
  /** YT held, redeemable one for one. */
  balance: bigint;
}

/**
 * Protocol wide totals, for the public tracker.
 *
 * Every figure is a live chain read, never a running tally the app keeps. See
 * `getProtocolTotals` for what `paidOutUsdg` does and does not count.
 */
export interface ProtocolTotals {
  /** USDG value of every stock on deposit that the oracle would price, 6 decimals. */
  stockUsdg: bigint;
  /**
   * Symbols holding stock the oracle refused to price. Their value is missing from
   * `stockUsdg`, so a non empty list means the total is a floor, not the whole number.
   */
  unpriced: string[];
  /** Per token breakdown, biggest first. `valueUsdg` is null on a quiet feed. */
  byToken: {
    address: Address;
    symbol: string;
    /** Stock tokens on deposit across everyone, in the token's own decimals. */
    amount: bigint;
    valueUsdg: bigint | null;
    /**
     * What a dollar on deposit in this stock has actually been paid, as a percentage
     * of the amount deposited. Realised and cumulative, not a forecast and not
     * annualised — see `realisedPct` in the client for why annualising a discretionary
     * drop produces a number nobody should act on.
     *
     * Null before anything has been distributed, or when this stock cannot be priced.
     */
     realisedPct: number | null;
  }[];
  /** USDG holders have redeemed and taken to their wallets, cumulative. */
  paidOutUsdg: bigint;
  /** YT outstanding: allocated to holders, not yet taken. */
  owedUsdg: bigint;
  /** USDG paid into the reward vault, cumulative. */
  fundedUsdg: bigint;
  /**
   * Every YT ever handed out, taken or not: what holders have actually been given.
   *
   * This is the numerator of the realised return. `paidOutUsdg` is only the part that
   * has been walked to a wallet, which says more about how often people press a button
   * than about what the protocol paid.
   */
  rewardedUsdg: bigint;
}

/** A stock token the protocol knows about. */
export interface StockToken {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  /**
   * USDG per whole token, 6 decimals, or null when the oracle refuses to price it.
   *
   * A Chainlink feed that has not updated inside its heartbeat reverts rather than
   * answering, which is correct: nobody should trade on a price nobody stands behind.
   * But that is one token's problem, and reading the list must not fail because of it.
   */
  priceUsdg: bigint | null;
}

/** A declared dividend, enriched for display. */
export interface DividendView {
  id: bigint;
  stockToken: Address;
  symbol: string;
  /** USDG (6dp) per whole stock token. */
  amountPerToken: bigint;
  exDate: number;
  payDate: number;
  declaredAt: number;
  status: DividendStatus;
  /** Seconds between the ex date and the pay date. This is how early you get paid. */
  daysEarly: number;
}

/** A holder's deposited position in one stock token. */
export interface PositionView {
  stockToken: Address;
  symbol: string;
  /** Stock tokens on deposit, 18 decimals. */
  amount: bigint;
  mode: Mode;
  /** Position value in USDG, 6 decimals. Null when the stock cannot be priced. */
  valueUsdg: bigint | null;
}

/** An open or closed dividend stream. */
export interface StreamView {
  id: bigint;
  user: Address;
  dividendId: bigint;
  stockToken: Address;
  symbol: string;
  /** Total USDG the stream pays over its life, 6 decimals. */
  total: bigint;
  claimed: bigint;
  claimable: bigint;
  start: number;
  end: number;
  mode: Mode;
  closed: boolean;
  /** USDG per second, scaled by 1e18. Used to interpolate the live counter. */
  ratePerSecondScaled: bigint;
}

/** Everything the vault page needs, in one read. */
export interface VaultStats {
  totalAssets: bigint;
  cash: bigint;
  freeCash: bigint;
  receivables: bigint;
  obligations: bigint;
  totalFeesAccrued: bigint;
  totalLosses: bigint;
  utilizationBps: bigint;
  maxUtilizationBps: bigint;
  advanceFeeBps: bigint;
  totalSupply: bigint;
  /**
   * Decimals the vault's SHARES carry, which is not the asset's six: AdvanceVault
   * adds a _decimalsOffset() of 3 on top. Scale raw share amounts by this, never by
   * the stock token's 1e18.
   */
  shareDecimals: number;
  /** Assets for one whole share, i.e. 10 ** shareDecimals of them. */
  sharePrice: bigint;
}

/** A borrower's position in the credit market. */
export interface CreditPosition {
  /** USDG value of every stock this holder has on deposit, 6 decimals. */
  collateralUsdg: bigint;
  /** Most they could owe in total, at the max LTV. */
  borrowingPower: bigint;
  /** Owed right now, principal plus accrued interest. */
  debt: bigint;
  /** Still drawable, bounded by both collateral and pool liquidity. */
  available: bigint;
  /** Interest owed on top of principal. */
  accruedInterest: bigint;
  /** Dividend income routed at this debt over the loan's life. */
  servicedFromDividends: bigint;
  /** Collateral at the liquidation threshold over debt, in bps. 10000 is the line. */
  healthFactorBps: bigint;
  /** Current borrow rate from the kinked curve, in bps per year. */
  borrowRateBps: bigint;
}

/** The credit market's risk parameters, as deployed. */
export interface CreditParameters {
  maxLtvBps: bigint;
  liquidationThresholdBps: bigint;
  liquidationBonusBps: bigint;
  closeFactorBps: bigint;
}

/** One split series: a stock, a maturity, and the two tokens it was cut into. */
export interface SplitSeriesView {
  seriesId: bigint;
  stockToken: Address;
  symbol: string;
  name: string;
  maturity: number;
  principalToken: Address;
  yieldToken: Address;
  /** Share tokens outstanding. Backed 1:1 by stock in custody. */
  ptSupply: bigint;
  ytSupply: bigint;
  /**
   * USDG per whole stock token, 6 decimals, or null when the oracle will not price it.
   * Null is a series whose underlying has a quiet feed — the series is still real and
   * still splittable, only its dollar figures are unknown. It is not a reason to hide
   * the series, which is what throwing here used to do to all of them at once.
   */
  priceUsdg: bigint | null;
  splitFeeBps: number;
}

/** A holder's balances in one series. */
export interface SplitPositionView {
  seriesId: bigint;
  ptBalance: bigint;
  ytBalance: bigint;
}

/** A dividend on a series' underlying, from the series' point of view. */
export interface SplitDividendView {
  seriesId: bigint;
  dividendId: bigint;
  symbol: string;
  amountPerToken: bigint;
  exDate: number;
  /**
   * Whether the series held any of the stock when this dividend went ex.
   *
   * A dividend that went ex before the series had a balance pays it nothing, and
   * harvesting reverts with NothingEligible. The row carries this so the UI can say
   * "nothing to collect" instead of offering a button that fails.
   */
  eligible: boolean;
  /** True once anyone has pulled the entitlement into the series' yield pool. */
  harvested: boolean;
  /** USDG the harvest produced for the whole series. */
  pool: bigint;
  /** This holder's pro rata share, by dividend token balance at the ex date. */
  claimable: bigint;
  claimed: boolean;
}

/** An LP's stake in the vault. */
export interface VaultPosition {
  shares: bigint;
  assets: bigint;
  maxWithdraw: bigint;
}

/**
 * A transaction the caller has not signed and this SDK will never sign.
 * Every write path returns one of these. The wallet decides.
 */
export interface UnsignedTx {
  to: Address;
  data: Hex;
  value: Hex;
  /** One line the user can read before they sign. */
  description: string;
}

/** A protocol event, flattened for the activity feed. */
export interface ActivityItem {
  kind:
    | "Deposited"
    | "Withdrawn"
    | "ModeSet"
    | "EntitlementActivated"
    | "StreamClaimed"
    | "Reinvested"
    | "SettledEntitlementClaimed";
  blockNumber: bigint;
  txHash: Hex;
  /** Ready to render. Numbers already formatted. */
  summary: string;
}
