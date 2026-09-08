import type { Address } from "viem";

/**
 * The listing universe: which stock tokens exist on a chain, which Chainlink feed
 * prices each one, how a swap reaches it, and whether it has earned its way onto
 * the venue. Maintained by hand in contracts/listings/<chainId>.json, verified
 * onchain by contracts/script/VerifyUniverse.s.sol, and exported here so every
 * consumer reads the same table.
 */

/**
 * How much trust the pool has earned.
 * live        — real protocol buys have executed through this route.
 * quote_first — the route quotes in the right tiers, but no buy has been observed;
 *               quote through QuoterV2 before every trade.
 * none        — never traded. Do not route.
 */
export type LiquidityStatus = "live" | "quote_first" | "none";

export interface ListedToken {
  symbol: string;
  address: Address;
  /** Chainlink USD feed, 8 decimals, read via latestRoundData. */
  feed: Address;
  /**
   * Seconds before a feed's answer is refused as stale, per feed.
   *
   * The deploy wires this into ChainlinkPriceOracle.setFeed and VerifyUniverse checks
   * against the same number, so the bound that gates listing is the bound that gates
   * pricing. Absent, both fall back to the oracle's own default of one hour, which a
   * mainnet read showed is too tight for these deviation triggered feeds.
   */
  heartbeat?: number;
  /** Hop sequence, e.g. ["WETH", 3000, "USDG", 3000, "NVDA"]. No direct ETH pools exist. */
  route: (string | number)[];
  liquidity: LiquidityStatus;
  /**
   * Dividend payments this stock makes in a year: 4 for a normal quarterly payer, 2
   * for a semi annual one, 0 for a stock that pays nothing.
   *
   * The displayed yield annualises the next declared payment by this figure. It used
   * to assume 4 for everything, which silently doubles the yield of a semi annual
   * payer and invents one entirely for a stock that has never paid a dividend.
   * Absent, no yield is shown — the honest answer when nobody has said how often the
   * stock pays.
   */
  dividendsPerYear?: number;
  /** A token with enabled false is never shown, quoted, or routed. */
  enabled: boolean;
  note?: string;
}

export interface ListingUniverse {
  chainId: number;
  network: string;
  rpc: string;
  explorer: string;
  infra: {
    weth: Address;
    usdg: Address;
    swapRouter02: Address;
    quoterV2: Address;
    ethUsdFeed: Address;
    defaultFeeTier: number;
    /** Applied to any token that names no heartbeat of its own. */
    defaultHeartbeat?: number;
  };
  /** The operating rules that gate every listing. Read them before touching the table. */
  rules: string[];
  tokens: ListedToken[];
}
