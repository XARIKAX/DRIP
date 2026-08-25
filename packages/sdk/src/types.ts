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
  usdg: Address;
  dividendRegistry: Address;
  advanceVault: Address;
  dripCore: Address;
  streamEngine: Address;
  reinvestor: Address;
  swapAdapter: Address;
  /** Ticker to address. */
  tokens: Record<string, Address>;
  /** Ticker to USDG price of one whole token, 6 decimals. */
  prices: Record<string, number>;
}

/** A stock token the protocol knows about. */
export interface StockToken {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  /** USDG per whole token, 6 decimals. */
  priceUsdg: bigint;
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
  /** Position value in USDG, 6 decimals. */
  valueUsdg: bigint;
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
  /** Assets per 1e18 shares. */
  sharePrice: bigint;
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
