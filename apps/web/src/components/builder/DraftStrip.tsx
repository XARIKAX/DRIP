"use client";

import { useCallback, useEffect, useState } from "react";

import { formatPct } from "@/lib/stack/allocation";
import { stackAccent } from "@/lib/palette";
import { deleteDraft, readDrafts, type StackDraft } from "@/lib/stack/draft";

/**
 * Stacks you have saved, on the page where they are useful.
 *
 * Not a route of its own, deliberately. These are drafts on this browser — they are not
 * a portfolio, they are not held anywhere, and giving them a destination in the nav
 * would dress up a local scratchpad as something the protocol knows about. Restoring one
 * puts you straight back in the editor, which is the only place a draft is worth
 * anything.
 */

export function DraftStrip({
  currentId,
  persists,
  hasWork,
  onRestore,
  onReset,
}: {
  currentId: string;
  persists: boolean;
  hasWork: boolean;
  onRestore: (draft: StackDraft) => void;
  onReset: () => void;
}) {
  const [drafts, setDrafts] = useState<StackDraft[]>([]);
  const [confirming, setConfirming] = useState(false);

  const refresh = useCallback(() => setDrafts(readDrafts().drafts), []);

  // The list is re-read whenever the current draft changes identity or content, because
  // the autosave that just ran is what put a new entry in it.
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, [refresh]);

  if (!persists) {
    return (
      <p className="rounded-md border border-line bg-ground-2 px-4 py-3 text-[13px] leading-relaxed text-muted">
        This browser is not saving anything. The builder works exactly the same — it just
        will not remember this Stack tomorrow.
      </p>
    );
  }

  const others = drafts.filter((d) => d.id !== currentId);
  if (others.length === 0 && !hasWork) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {others.length > 0 ? (
        <>
          <span className="serial mr-1">Saved</span>
          <ul className="no-scrollbar flex max-w-full gap-2 overflow-x-auto">
            {others.map((draft) => (
              <li key={draft.id} className="shrink-0">
                <span className="group flex items-center gap-2 rounded-full border border-line bg-paper py-1.5 pl-3 pr-1.5 transition-colors hover:border-accent/50">
                  <button
                    type="button"
                    className="flex items-center gap-2"
                    onClick={() => onRestore(draft)}
                  >
                    <span aria-hidden className="flex -space-x-1">
                      {draft.allocations.slice(0, 3).map((a) => (
                        <span
                          key={a.assetId}
                          className="h-2.5 w-2.5 rounded-full border border-paper"
                          style={{ background: stackAccent(a.slot) }}
                        />
                      ))}
                    </span>
                    <span className="max-w-[160px] truncate text-[12px] font-semibold text-ink">
                      {draft.name.trim() || `$${draft.ticker || "Untitled"}`}
                    </span>
                    <span className="num text-[11px] text-faint">
                      {draft.allocations.length} ·{" "}
                      {formatPct(draft.allocations[0]?.weightBps ?? 0)}%
                    </span>
                  </button>
                  <button
                    type="button"
                    className="flex h-5 w-5 items-center justify-center rounded-full text-faint transition-colors hover:bg-ground-3 hover:text-down"
                    onClick={() => {
                      deleteDraft(draft.id);
                      refresh();
                    }}
                  >
                    <span className="sr-only">
                      Delete the saved Stack {draft.name.trim() || draft.ticker}
                    </span>
                    <svg viewBox="0 0 12 12" width="9" height="9" fill="none" aria-hidden>
                      <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {hasWork ? (
        <div className="ml-auto flex items-center gap-2">
          {confirming ? (
            <>
              <span className="text-[12px] text-muted">Clear this Stack?</span>
              <button
                type="button"
                className="btn-quiet btn-sm py-1.5 text-[11px]"
                onClick={() => setConfirming(false)}
              >
                Keep it
              </button>
              <button
                type="button"
                className="btn-ghost btn-sm py-1.5 text-[11px]"
                onClick={() => {
                  setConfirming(false);
                  onReset();
                }}
              >
                Clear
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-quiet btn-sm py-1.5 text-[11px]"
              onClick={() => setConfirming(true)}
            >
              Start over
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
