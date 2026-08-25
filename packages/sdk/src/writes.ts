import { encodeFunctionData, erc20Abi, maxUint256, type Address } from "viem";
import {
  dripCoreAbi,
  streamEngineAbi,
  advanceVaultAbi,
  reinvestorAbi,
  mockUSDGAbi,
  mockStockTokenAbi,
} from "./generated";
import { Mode, MODE_LABELS, type Deployment, type UnsignedTx } from "./types";

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
    `Deposit ${symbol || "stock tokens"} into DRIP`
  );
}

/** Withdraw stock tokens from DripCore. */
export function buildWithdraw(d: Deployment, stockToken: Address, amount: bigint, symbol = ""): UnsignedTx {
  return tx(
    d.dripCore,
    encodeFunctionData({ abi: dripCoreAbi, functionName: "withdraw", args: [stockToken, amount] }),
    `Withdraw ${symbol || "stock tokens"} from DRIP`
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
