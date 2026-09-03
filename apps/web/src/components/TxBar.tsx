"use client";

import type { TxRunState } from "@/lib/tx";
import { explorerTx } from "@/lib/chain.config";

/** One line of honest feedback. Which step, what it is doing, what went wrong. */
export function TxBar({ state, onDismiss }: { state: TxRunState; onDismiss?: () => void }) {
  if (state.status === "idle") return null;

  const tone =
    state.status === "error" ? "border-down" : state.status === "done" ? "border-up" : "border-line";

  const label =
    state.status === "error"
      ? state.error
      : state.status === "done"
        ? "Confirmed"
        : `${state.status === "signing" ? "Sign in wallet" : "Confirming"} — ${state.label}`;

  const link = state.hash ? explorerTx(state.hash) : null;

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 border ${tone} px-4 py-3`}>
      <div className="flex items-center gap-3">
        {state.steps > 1 ? (
          <span className="num text-micro font-bold text-muted">
            {Math.min(state.step + 1, state.steps)}/{state.steps}
          </span>
        ) : null}
        <span className="text-[13px] font-semibold">{label}</span>
      </div>
      <div className="flex items-center gap-3">
        {link ? (
          <a href={link} target="_blank" rel="noreferrer" className="text-micro font-bold uppercase underline">
            View
          </a>
        ) : null}
        {onDismiss && (state.status === "done" || state.status === "error") ? (
          <button type="button" className="text-micro font-bold uppercase text-muted" onClick={onDismiss}>
            Dismiss
          </button>
        ) : null}
      </div>
    </div>
  );
}
