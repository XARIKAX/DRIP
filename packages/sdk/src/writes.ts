import { encodeFunctionData, erc20Abi, maxUint256, type Address } from "viem";
import {
  dripCoreAbi,
  lendingPoolAbi,
  splitVaultAbi,
  streamEngineAbi,
  advanceVaultAbi,
  reinvestorAbi,
  rewardVaultAbi,
  mockUSDGAbi,
  mockStockTokenAbi,
} from "./generated";
import { Mode, MODE_LABELS, type Deployment, type UnsignedTx } from "./types";
import { formatStock, formatUsdg } from "./format";

/**
 * Every write in the protocol, as an unsigned transaction.
 *
 * Nothing here holds a key, opens a wallet, or sends anything. A builder returns
 * calldata and a one line description; the caller decides what to do with it. That is
 * what lets the web app, the agent console and the MCP server share one code path:
 * the browser hands it to wagmi, an external agent hands it back to the user's wallet.
 */

function tx(to: Address, data: `0x${string}`, description: string): UnsignedTx {
  return { to, data, value: "0x0", description };
}

/** Approve a spender. Pass no amount for an unlimited approval. */
export function buildApprove(token: Address, spender: Address, amount?: bigint, label = "tokens"): UnsignedTx {
  return tx(
    token,
    encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [spender, amount ?? maxUint256] }),
    `Approve ${label} for the protocol`
  );
}

/** Deposit stock tokens into DripCore. Requires an approval first. */
export function buildDeposit(d: Deployment, stockToken: Address, amount: bigint, symbol = ""): UnsignedTx {
  return tx(
    d.dripCore,
    encodeFunctionData({ abi: dripCoreAbi, functionName: "deposit", args: [stockToken, amount] }),
    `Deposit ${symbol || "stock tokens"} into Osinko`
  );
}

/** Withdraw stock tokens from DripCore. */
export function buildWithdraw(d: Deployment, stockToken: Address, amount: bigint, symbol = ""): UnsignedTx {
  return tx(
    d.dripCore,
    encodeFunctionData({ abi: dripCoreAbi, functionName: "withdraw", args: [stockToken, amount] }),
    `Withdraw ${symbol || "stock tokens"} from Osinko`
  );
}

/** Choose what happens to dividends on a token. */
export function buildSetMode(d: Deployment, stockToken: Address, mode: Mode, symbol = ""): UnsignedTx {
  return tx(
    d.dripCore,
    encodeFunctionData({ abi: dripCoreAbi, functionName: "setMode", args: [stockToken, mode] }),
    `Set ${symbol || "position"} to ${MODE_LABELS[mode]}`
  );
}

/** Route a declared dividend. Permissionless: the money can only go to the holder. */
export function buildActivate(d: Deployment, dividendId: bigint, user: Address): UnsignedTx {
  return tx(
    d.dripCore,
    encodeFunctionData({ abi: dripCoreAbi, functionName: "activate", args: [dividendId, user] }),
    `Start dividend #${dividendId}`
  );
}

/** Pull everything a stream has accrued. */
export function buildClaimStream(d: Deployment, streamId: bigint): UnsignedTx {
  return tx(
    d.streamEngine,
    encodeFunctionData({ abi: streamEngineAbi, functionName: "claim", args: [streamId] }),
    `Claim stream #${streamId}`
  );
}

/** Take a settled dividend the slow way, with no advance and no fee. */
export function buildClaimSettled(d: Deployment, dividendId: bigint): UnsignedTx {
  return tx(
    d.dripCore,
    encodeFunctionData({ abi: dripCoreAbi, functionName: "claimSettled", args: [dividendId] }),
    `Claim settled dividend #${dividendId}`
  );
}

/** Set the caller's reinvestment slippage tolerance, in basis points. */
export function buildSetMaxSlippage(d: Deployment, bps: number): UnsignedTx {
  return tx(
    d.reinvestor,
    encodeFunctionData({ abi: reinvestorAbi, functionName: "setMaxSlippage", args: [BigInt(bps)] }),
    `Set reinvest slippage to ${(bps / 100).toFixed(2)} percent`
  );
}

/** LP side: put USDG into the vault. */
export function buildVaultDeposit(d: Deployment, assets: bigint, receiver: Address): UnsignedTx {
  return tx(
    d.advanceVault,
    encodeFunctionData({ abi: advanceVaultAbi, functionName: "deposit", args: [assets, receiver] }),
    `Deposit USDG into the advance vault`
  );
}

/** LP side: take USDG out of the vault. Bounded by unlent cash. */
export function buildVaultWithdraw(d: Deployment, assets: bigint, receiver: Address, owner: Address): UnsignedTx {
  return tx(
    d.advanceVault,
    encodeFunctionData({ abi: advanceVaultAbi, functionName: "withdraw", args: [assets, receiver, owner] }),
    `Withdraw USDG from the advance vault`
  );
}

/**
 * Burn YT, take the USDG behind it.
 *
 * Touches nothing else a holder owns: the stock stays on deposit, still earning,
 * still borrowable against. That separation is the point of the reward being its own
 * token rather than something carved out of the position.
 */
export function buildRewardRedeem(d: Deployment, amount: bigint): UnsignedTx {
  if (!d.rewardVault) throw new Error("This deployment has no reward vault");
  return tx(
    d.rewardVault,
    encodeFunctionData({ abi: rewardVaultAbi, functionName: "redeem", args: [amount] }),
    `Redeem YT for USDG`
  );
}

/** Testnet faucet for a stock token. */
export function buildStockFaucet(stockToken: Address, symbol = ""): UnsignedTx {
  return tx(
    stockToken,
    encodeFunctionData({ abi: mockStockTokenAbi, functionName: "faucet" }),
    `Mint test ${symbol || "stock tokens"}`
  );
}

/** Testnet faucet for USDG. */
export function buildUsdgFaucet(d: Deployment): UnsignedTx {
  return tx(
    d.usdg,
    encodeFunctionData({ abi: mockUSDGAbi, functionName: "faucet" }),
    `Mint test USDG`
  );
}

// ---------------------------------------------------------------------------
// Credit
// ---------------------------------------------------------------------------

/** The credit market's address, or a readable failure. */
function pool(d: Deployment): Address {
  if (!d.lendingPool) {
    throw new Error("No lending pool on this chain. Redeploy to get one; the address book predates the credit market.");
  }
  return d.lendingPool;
}

/** Draw USDG against stock already on deposit. */
export function buildBorrow(d: Deployment, amount: bigint): UnsignedTx {
  return tx(
    pool(d),
    encodeFunctionData({ abi: lendingPoolAbi, functionName: "borrow", args: [amount] }),
    `Borrow ${formatUsdg(amount)} USDG against your stock`
  );
}

/**
 * Repay a debt.
 *
 * Pass viem's maxUint256 to clear the whole thing: the debt grows every second, so an
 * amount computed in the browser is stale by the time it is signed, and repaying
 * "the exact balance" would always leave dust behind.
 */
export function buildRepay(d: Deployment, user: Address, amount: bigint): UnsignedTx {
  const whole = amount === maxUint256;
  return tx(
    pool(d),
    encodeFunctionData({ abi: lendingPoolAbi, functionName: "repay", args: [user, amount] }),
    whole ? "Repay the whole loan" : `Repay ${formatUsdg(amount)} USDG`
  );
}

/** Choose whether dividend income also pays down principal, not just interest. */
export function buildSetAutoRepayPrincipal(d: Deployment, enabled: boolean): UnsignedTx {
  return tx(
    pool(d),
    encodeFunctionData({ abi: lendingPoolAbi, functionName: "setAutoRepayPrincipal", args: [enabled] }),
    enabled ? "Let dividends pay down the loan itself" : "Dividends pay the interest only"
  );
}

// ---------------------------------------------------------------------------
// Split
// ---------------------------------------------------------------------------

/** The split vault's address, or a readable failure. */
function splitVault(d: Deployment): Address {
  if (!d.splitVault) {
    throw new Error("No split vault on this chain. Redeploy to get one; the address book predates it.");
  }
  return d.splitVault;
}

/** Cut stock into a share token and a dividend token. */
export function buildSplit(d: Deployment, seriesId: bigint, amount: bigint, symbol = ""): UnsignedTx {
  return tx(
    splitVault(d),
    encodeFunctionData({ abi: splitVaultAbi, functionName: "split", args: [seriesId, amount] }),
    `Split ${formatStock(amount)} ${symbol || "stock"} into a share token and a dividend token`
  );
}

/** Put the two halves back together at par. */
export function buildMerge(d: Deployment, seriesId: bigint, amount: bigint, symbol = ""): UnsignedTx {
  return tx(
    splitVault(d),
    encodeFunctionData({ abi: splitVaultAbi, functionName: "merge", args: [seriesId, amount] }),
    `Rejoin ${formatStock(amount)} ${symbol || "stock"} from its two halves`
  );
}

/** Redeem share tokens for the underlying stock, on or after the end date. */
export function buildRedeemPrincipal(d: Deployment, seriesId: bigint, amount: bigint, symbol = ""): UnsignedTx {
  return tx(
    splitVault(d),
    encodeFunctionData({ abi: splitVaultAbi, functionName: "redeemPrincipal", args: [seriesId, amount] }),
    `Redeem ${formatStock(amount)} share tokens for ${symbol || "stock"}`
  );
}

/**
 * Pull a dividend into the series' pool so dividend token holders can collect it.
 *
 * Permissionless on purpose: anyone may harvest, and the money lands in the series
 * rather than with whoever called. Without that, a series would depend on one holder
 * remembering to act.
 */
export function buildHarvestDividend(d: Deployment, seriesId: bigint, dividendId: bigint): UnsignedTx {
  return tx(
    splitVault(d),
    encodeFunctionData({ abi: splitVaultAbi, functionName: "harvestDividend", args: [seriesId, dividendId] }),
    "Pull this dividend into the series so it can be collected"
  );
}

/** Collect this holder's share of a harvested dividend. */
export function buildClaimYield(d: Deployment, seriesId: bigint, dividendId: bigint): UnsignedTx {
  return tx(
    splitVault(d),
    encodeFunctionData({ abi: splitVaultAbi, functionName: "claimYield", args: [seriesId, dividendId] }),
    "Collect your share of this dividend"
  );
}
