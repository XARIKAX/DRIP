"use client";

import type { Address } from "viem";
import { Mode, MODE_DESCRIPTIONS, MODE_LABELS, buildSetMode } from "@drip/sdk";
import { useDeployment } from "@/lib/hooks";
import { useTxRunner } from "@/lib/tx";

const ORDER: Mode[] = [Mode.CASH_EARLY, Mode.STREAM, Mode.REINVEST];

/**
 * Three buttons, one selected. The mode is a per token setting, so it lives on the
 * row it belongs to rather than behind a settings screen.
 */
export function ModeSwitcher({
  stockToken,
  symbol,
  current,
  onChanged,
}: {
  stockToken: Address;
  symbol: string;
  current: Mode;
  onChanged?: () => void;
}) {
  const deployment = useDeployment();
  const { state, run } = useTxRunner();
  const busy = state.status === "signing" || state.status === "confirming";

  async function pick(mode: Mode) {
    if (!deployment || mode === current || busy) return;
    const ok = await run([buildSetMode(deployment, stockToken, mode, symbol)]);
    if (ok) onChanged?.();
  }

  return (
    <div className="inline-flex border border-ink">
      {ORDER.map((mode, i) => {
        const active = mode === current;
        return (
          <button
            key={mode}
            type="button"
            disabled={busy}
            title={MODE_DESCRIPTIONS[mode]}
            onClick={() => void pick(mode)}
            className={`px-3 py-2 text-micro font-bold uppercase transition-colors disabled:opacity-50 ${
              i > 0 ? "border-l border-ink" : ""
            } ${active ? "bg-ink text-paper" : "bg-paper text-ink hover:bg-cyan"}`}
          >
            {MODE_LABELS[mode]}
          </button>
        );
      })}
    </div>
  );
}
