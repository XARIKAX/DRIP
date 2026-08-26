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
  /** Chainlink USD feed, 8 decimals, read via latestRoundData with a 1h heartbeat. */
  feed: Address;
  /** Hop sequence, e.g. ["WETH", 3000, "USDG", 3000, "NVDA"]. No direct ETH pools exist. */
  route: (string | number)[];
  liquidity: LiquidityStatus;
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
  };
  /** The operating rules that gate every listing. Read them before touching the table. */
  rules: string[];
  tokens: ListedToken[];
}
