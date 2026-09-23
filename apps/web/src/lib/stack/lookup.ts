/**
 * Turning a pasted contract address into something with a name and a face.
 *
 * Two sources, in this order, because they fail in opposite directions.
 *
 * **DexScreener** knows Robinhood Chain (`chainId: "robinhood"`) and answers with the
 * whole identity — name, symbol, a price, a logo — for anything that trades. It is also
 * CORS-open (`access-control-allow-origin: *`), so the browser calls it directly with no
 * proxy and no API route to keep alive. What it cannot do is tell you about a token that
 * has never had a pair.
 *
 * **The chain itself** answers for any ERC-20 that exists, listed or not, through the
 * RPC the app is already pointed at. What it cannot do is give you a price or a picture.
 *
 * So: ask the index, and if it has never heard of the thing, ask the contract. A token
 * with no pair comes back named and unpriced rather than not at all, and the UI shows a
 * dash where the price would be — which is the same thing it does for a stock whose feed
 * has gone quiet, and for the same reason.
 *
 * Nothing here throws for an ordinary miss. A miss is an answer.
 */

import { isAddress, tokenAsset, type BuilderAsset } from "./asset";

/** DexScreener's name for Robinhood Chain. Verified against a live response. */
const DEX_CHAIN = "robinhood";
const DEX_TOKENS = "https://api.dexscreener.com/latest/dex/tokens";

export type LookupResult =
  | { ok: true; asset: BuilderAsset; source: "index" | "chain" }
  | { ok: false; reason: string };

/** The minimum an ERC-20 has to answer to be worth showing. */
export interface ChainReader {
  read(address: string): Promise<{ name: string; symbol: string } | null>;
}

interface DexPair {
  chainId?: string;
  priceUsd?: string;
  liquidity?: { usd?: number };
  baseToken?: { address?: string; name?: string; symbol?: string };
  quoteToken?: { address?: string; name?: string; symbol?: string };
  info?: { imageUrl?: string };
}

/**
 * Pick the pair that best describes a token.
 *
 * A token has many pairs and they disagree — a thin one can quote a price an order of
 * magnitude off. Deepest liquidity is the one least easy to push around, so that is the
 * one whose price and image get shown.
 */
function bestPair(pairs: DexPair[], address: string): DexPair | null {
  const want = address.toLowerCase();
  const mine = pairs.filter(
    (p) =>
      p.chainId === DEX_CHAIN &&
      (p.baseToken?.address?.toLowerCase() === want || p.quoteToken?.address?.toLowerCase() === want)
  );
  if (mine.length === 0) return null;
  return mine.reduce((best, p) =>
    (p.liquidity?.usd ?? 0) > (best.liquidity?.usd ?? 0) ? p : best
  );
}

/** Which side of the pair is the token being asked about. */
function sideOf(pair: DexPair, address: string) {
  const want = address.toLowerCase();
  return pair.baseToken?.address?.toLowerCase() === want ? pair.baseToken : pair.quoteToken;
}

/**
 * Look a token up.
 *
 * `fetchImpl` and `reader` are parameters rather than imports so this can be exercised
 * without a network or a chain behind it.
 */
export async function lookupToken(
  rawAddress: string,
  opts: { fetchImpl?: typeof fetch; reader?: ChainReader; signal?: AbortSignal } = {}
): Promise<LookupResult> {
  const address = rawAddress.trim();
  if (!address) return { ok: false, reason: "Paste a contract address to look it up." };
  if (!isAddress(address)) {
    return {
      ok: false,
      reason: "That does not look like a contract address — they start 0x and run 42 characters.",
    };
  }

  const doFetch = opts.fetchImpl ?? (typeof fetch !== "undefined" ? fetch : undefined);

  if (doFetch) {
    try {
      const res = await doFetch(`${DEX_TOKENS}/${address}`, { signal: opts.signal });
      if (res.ok) {
        const body = (await res.json()) as { pairs?: DexPair[] | null };
        const pair = bestPair(body.pairs ?? [], address);
        const side = pair ? sideOf(pair, address) : null;
        if (pair && side?.symbol) {
          const price = Number(pair.priceUsd);
          return {
            ok: true,
            source: "index",
            asset: tokenAsset({
              address,
              symbol: side.symbol,
              name: side.name || side.symbol,
              priceUsd: Number.isFinite(price) && price > 0 ? price : null,
              logoUrl: pair.info?.imageUrl,
            }),
          };
        }
      }
    } catch (err) {
      // A refused or aborted request is not a verdict on the token. Fall through to the
      // chain, which is the source that can actually settle whether it exists.
      if ((err as { name?: string })?.name === "AbortError") {
        return { ok: false, reason: "Cancelled." };
      }
    }
  }

  if (opts.reader) {
    try {
      const onchain = await opts.reader.read(address);
      if (onchain?.symbol) {
        return {
          ok: true,
          source: "chain",
          asset: tokenAsset({
            address,
            symbol: onchain.symbol,
            name: onchain.name || onchain.symbol,
            priceUsd: null,
          }),
        };
      }
    } catch {
      // Same again: an RPC that will not answer is not proof of absence.
    }
  }

  return {
    ok: false,
    reason: "Nothing at that address on Robinhood Chain — check it and try again.",
  };
}

/** Tokens with real liquidity on Robinhood Chain, for the example button. */
export const EXAMPLE_TOKENS = [
  { symbol: "PONS", address: "0x39dBED3a2bd333467115dE45665cC57F813C4571" },
  { symbol: "ROBIN", address: "0x11B70d0243baf75E85CE03201A92b5B7C33BEB59" },
  { symbol: "SHROOM", address: "0xab093dEF657F15dF31b33922A95e047aDd645B29" },
] as const;
