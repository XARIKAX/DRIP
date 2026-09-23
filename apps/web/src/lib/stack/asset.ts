/**
 * What a Stack can hold.
 *
 * The builder started life keyed to stock tickers, because stocks were the only thing
 * there was. Then it had to hold anything with a contract address on Robinhood Chain,
 * and "the asset id is a ticker" stopped being true — two different memecoins can both
 * call themselves ROBINHOOD, and several do. So an asset is identified by a key that
 * says what kind of thing it is, and a ticker is only ever a label.
 *
 * Everything downstream — the ring, the sliders, the card, the draft, the export —
 * speaks `BuilderAsset` and never asks where it came from.
 */

export type AssetKind = "stock" | "token";

export interface BuilderAsset {
  /** Stable identity. A ticker for a stock, a lowercased address for a token. */
  id: string;
  kind: AssetKind;
  /** What to print on a badge. Not unique across tokens, and never used as identity. */
  symbol: string;
  name: string;
  /** The small grey line under the name. Sector for a stock, chain for a token. */
  note: string;
  /** Null when nothing will price it. Not zero — those are different claims. */
  priceUsd: number | null;
  /** Tokens only. */
  address?: string;
  /** Tokens only: a remote logo. Stocks resolve their own from /logos. */
  logoUrl?: string;
}

/**
 * The canonical key for an asset.
 *
 * Addresses go lowercase and tickers go uppercase, which matters more than it looks:
 * the same token pasted as checksummed and as lowercase must be one asset, or a Stack
 * can hold it twice and still claim to add up to 100%.
 */
export function assetKey(raw: string): string {
  const s = raw.trim();
  return isAddress(s) ? s.toLowerCase() : s.toUpperCase();
}

/** A 20-byte hex address. Deliberately not checksum-validated — people paste lowercase. */
export function isAddress(raw: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(raw.trim());
}

/** `0x71C2…9A42` — the form every wallet uses, so it reads as an address at a glance. */
export function shortAddress(address: string): string {
  const a = address.trim();
  return a.length <= 12 ? a : `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/**
 * The one line of editorial in this feature.
 *
 * Hand-written, and deliberately so: no registry in this repo carries a sector. The
 * listing universe has feeds and routes, `TokenInfo` has prices and dates, and neither
 * has an opinion about what a company does. These are labels a person wrote to make a
 * row of tickers readable — they are not data, nothing computes against them, and a
 * ticker with no entry simply shows its name alone.
 */
const STOCK_NOTES: Record<string, { short: string; sector: string }> = {
  NVDA: { short: "NVIDIA", sector: "Robotics & AI" },
  TSLA: { short: "Tesla", sector: "Automotive" },
  AAPL: { short: "Apple", sector: "Consumer Tech" },
  GOOGL: { short: "Alphabet", sector: "Internet" },
  MSFT: { short: "Microsoft", sector: "Software" },
  AMZN: { short: "Amazon", sector: "E-commerce" },
  META: { short: "Meta Platforms", sector: "Social" },
  PLTR: { short: "Palantir", sector: "Data" },
  AMD: { short: "AMD", sector: "Semiconductors" },
  INTC: { short: "Intel", sector: "Semiconductors" },
  MU: { short: "Micron", sector: "Memory" },
  COIN: { short: "Coinbase", sector: "Crypto" },
  ORCL: { short: "Oracle", sector: "Enterprise" },
  CRWV: { short: "CoreWeave", sector: "Cloud GPU" },
  SNDK: { short: "SanDisk", sector: "Storage" },
};

/** A stock from the app's own registry, as the builder sees it. */
export function stockAsset(t: { symbol: string; name: string; priceUsd: number | null }): BuilderAsset {
  const note = STOCK_NOTES[t.symbol];
  return {
    id: t.symbol.toUpperCase(),
    kind: "stock",
    symbol: t.symbol,
    name: note?.short ?? t.name,
    note: note?.sector ?? "",
    priceUsd: t.priceUsd,
  };
}

/** A token somebody pasted in. */
export function tokenAsset(t: {
  address: string;
  symbol: string;
  name: string;
  priceUsd: number | null;
  logoUrl?: string;
}): BuilderAsset {
  return {
    id: t.address.toLowerCase(),
    kind: "token",
    symbol: t.symbol,
    name: t.name,
    note: "Robinhood Chain",
    priceUsd: t.priceUsd,
    address: t.address,
    logoUrl: t.logoUrl,
  };
}

/** The two-or-one letters a missing logo falls back to. Same rule as TokenMark. */
export function monogram(symbol: string): string {
  const s = symbol.replace(/[^A-Za-z0-9]/g, "") || "?";
  return s.slice(0, s.length > 3 ? 2 : 1).toUpperCase();
}
