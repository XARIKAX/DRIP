/**
 * What this build can actually do with a Stack, and what it cannot.
 *
 * The honest answer today: **a Stack cannot be created.** Nothing in `contracts/src/`
 * mints a multi-asset token. DripCore holds one stock per position, SplitVault cuts one
 * stock into two halves, AdvanceVault is a single USDG pool, and RewardVault pays one
 * reward token. `SplitVault.createSeries` is the only place in the protocol that deploys
 * an ERC-20 per product, and it is bound to exactly one `stockToken` and gated behind
 * `KEEPER_ROLE`. There is no factory, no basket, no index.
 *
 * So this module reports `preview-only` for minting, and the UI reads that flag rather
 * than hard-coding the sentence. The day a basket contract exists there is one file to
 * change and the copy follows.
 *
 * The second capability is real and is not minting. The weights a person sets imply an
 * amount of each stock, and depositing those amounts is something this protocol has done
 * since day one: `buildApprove` + `buildDeposit`, per asset, through `useTxRunner`. That
 * is offered as what it literally is — several ordinary deposits — and never as the
 * creation of anything.
 *
 * ## What a real Stack would need
 *
 * Four things, none of which this repo can invent:
 *
 * 1. **A basket contract.** Something that takes N stock tokens in fixed proportions,
 *    holds them, and mints one fungible claim on the lot. The nearest shape already here
 *    is `SplitVault.createSeries` — it deploys tokens per series and keeps per-series
 *    accounting — so that is the pattern to copy, widened from one underlying to many.
 * 2. **Share-denominated accounting.** Robinhood Chain stock tokens are ERC-8056: raw
 *    balances never move and the shares behind them accrete (`IScaledUI.uiMultiplier()`).
 *    A basket that tracks raw balances leaks every dividend its holdings earn. The header
 *    of `SplitVault.sol` documents this exact bug in the design it replaced; read it
 *    before writing any basket accounting.
 * 3. **An address in the book.** `contracts/deployments/<chainId>.json`, carried into
 *    `packages/sdk/src/generated/deployments.ts` by `pnpm abis`, plus its ABI.
 * 4. **A builder in the SDK.** A `buildCreateBasket(d, assets, weightsBps, name, symbol)`
 *    in `packages/sdk/src/writes.ts` returning an `UnsignedTx`, and the creation event to
 *    verify against the receipt — because a hash is not a success, and the UI must read
 *    the new basket's address out of the log before it says anything was created.
 *
 * Until all four exist, `mint` stays `preview-only` and no code path in this app can
 * reach a state that claims otherwise.
 */

import { chainId, isDeployed } from "@/lib/chain.config";

export type MintCapability = {
  kind: "preview-only";
  /** Shown to nobody; it is here so the reason travels with the flag. */
  reason: string;
};

export type DepositCapability =
  | { kind: "unavailable"; reason: string }
  /** The seeded account. Deposits land locally and are labelled as a preview. */
  | { kind: "sample" }
  /** Real approvals and real deposits into DripCore on a chain with an address book. */
  | { kind: "in-kind"; chainId: number };

export interface StackCapability {
  mint: MintCapability;
  deposit: DepositCapability;
}

/**
 * Resolve what this build can do.
 *
 * Takes only what the app already knows — is a wallet connected, does this chain have an
 * address book — and nothing a visitor can set. A capability that could be switched on
 * from `localStorage` or a query parameter would let a missing deployment quietly
 * pretend to be a working one, which is the single failure this whole module exists to
 * make impossible.
 */
export function resolveCapability(connected: boolean): StackCapability {
  const mint: MintCapability = {
    kind: "preview-only",
    reason: "No contract on this network can hold several stocks under one ticker.",
  };

  if (!connected || !isDeployed) return { mint, deposit: { kind: "sample" } };
  return { mint, deposit: { kind: "in-kind", chainId } };
}
