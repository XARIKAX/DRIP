"use client";

import { useCallback, useState } from "react";
import { useAccount, useConfig } from "wagmi";
import { sendTransaction, waitForTransactionReceipt } from "wagmi/actions";
import type { UnsignedTx } from "@drip/sdk";
import { useRefreshAll } from "@/lib/hooks";

/**
 * Runs a list of unsigned transactions in order, one signature at a time.
 *
 * Approve then deposit is two transactions and the user should see that, not a
 * spinner that lies about it. The runner reports which step it is on, stops on the
 * first failure, and refreshes every read when it finishes.
 */

export type TxStatus = "idle" | "signing" | "confirming" | "done" | "error";

export interface TxRunState {
  status: TxStatus;
  /** Zero based index of the step currently in flight. */
  step: number;
  /** Total steps in the current run. */
  steps: number;
  /** Human readable label of the step in flight. */
  label: string;
  error: string | null;
  hash: `0x${string}` | null;
}

const IDLE: TxRunState = { status: "idle", step: 0, steps: 0, label: "", error: null, hash: null };

export function useTxRunner() {
  const config = useConfig();
  const { address } = useAccount();
  const refresh = useRefreshAll();
  const [state, setState] = useState<TxRunState>(IDLE);

  const reset = useCallback(() => setState(IDLE), []);

  const run = useCallback(
    async (txs: UnsignedTx[]): Promise<boolean> => {
      if (!address) {
        setState({ ...IDLE, status: "error", error: "Connect a wallet first" });
        return false;
      }
      if (txs.length === 0) return true;

      for (let i = 0; i < txs.length; i++) {
        const tx = txs[i]!;
        setState({
          status: "signing",
          step: i,
          steps: txs.length,
          label: tx.description,
          error: null,
          hash: null,
        });

        try {
          const hash = await sendTransaction(config, {
            to: tx.to,
            data: tx.data,
            value: BigInt(tx.value),
          });
          setState((s) => ({ ...s, status: "confirming", hash }));
          const receipt = await waitForTransactionReceipt(config, { hash });
          if (receipt.status !== "success") throw new Error("Transaction reverted");
        } catch (err) {
          setState({
            status: "error",
            step: i,
            steps: txs.length,
            label: tx.description,
            error: readableError(err),
            hash: null,
          });
          return false;
        }
      }

      setState({ status: "done", step: txs.length, steps: txs.length, label: "", error: null, hash: null });
      refresh();
      return true;
    },
    [address, config, refresh]
  );

  return { state, run, reset };
}

/** Wallet errors are verbose and mostly noise. Keep the first useful line. */
export function readableError(err: unknown): string {
  if (!err) return "Something went wrong";
  const message = err instanceof Error ? err.message : String(err);
  if (/user rejected|denied transaction/i.test(message)) return "Rejected in wallet";
  if (/insufficient funds/i.test(message)) return "Not enough gas in this wallet";
  const first = message.split("\n").find((line) => line.trim().length > 0) ?? message;
  return first.length > 160 ? `${first.slice(0, 157)}...` : first;
}
