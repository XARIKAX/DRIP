"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAccount, useChainId } from "wagmi";

import { fmt } from "@/components/live";
import type { BuilderAsset } from "@/lib/stack/asset";
import { AssetMark } from "./AssetMark";
import { activeChain } from "@/lib/chain.config";
import { useDataActions, useWalletView } from "@/lib/data/provider";
import { formatPct, TOTAL_BPS, type Allocation } from "@/lib/stack/allocation";
import type { StackCapability } from "@/lib/stack/capability";
import type { StackDraft } from "@/lib/stack/draft";
import type { TokenInfo } from "@/lib/data/types";
import { stackAccent } from "@/lib/palette";
import { StackPreviewCard } from "./StackPreviewCard";
import { downloadStackCard } from "@/lib/stack/card";

/**
 * The last look, and the two honest endings.
 *
 * **Ending one — the preview.** Always available, wallet or not. A card, a picture, and
 * a plan you can come back to. The Stack itself is not created, because nothing on this
 * network can create one, and this dialog says so in those words.
 *
 * **Ending two — the deposits.** The weights imply an amount of each stock, and
 * depositing those amounts is something Osinko has always done. So it is offered as
 * exactly that: several ordinary deposits, one signature pair each, landing as several
 * ordinary holdings. No token is minted, no ticker exists onchain, and the dialog never
 * uses a word that would suggest otherwise.
 *
 * ### The frozen intent
 *
 * Opening this dialog snapshots the weights, the prices and the amounts. Prices refetch
 * on an interval, and a dialog whose numbers change under the cursor while somebody
 * reads them is a dialog that gets a different transaction signed than the one they
 * agreed to. The snapshot is rebuilt when they ask for it, never on its own.
 */

type Phase =
  | { kind: "reviewing" }
  | { kind: "running" }
  | { kind: "done" }
  | { kind: "partial"; completed: number; reason: string }
  | { kind: "failed"; reason: string }
  | { kind: "stale"; why: "account" | "network" };

interface Line {
  assetId: string;
  kind: "stock" | "token";
  symbol: string;
  weightBps: number;
  slot: number;
  priceUsd: number | null;
  usd: number;
  shares: number | null;
  /** What the achievable share count is actually worth, as a share of the whole. */
  actualBps: number | null;
}

export function ReviewDialog({
  draft,
  tokens,
  assets,
  capability,
  onClose,
}: {
  draft: StackDraft;
  tokens: TokenInfo[];
  assets: ReadonlyMap<string, BuilderAsset>;
  capability: StackCapability;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDivElement | null>(null);
  const trigger = useRef<Element | null>(null);
  const submitting = useRef(false);
  const actions = useDataActions();
  const wallet = useWalletView();
  const { address, isConnected } = useAccount();
  const currentChainId = useChainId();

  const [phase, setPhase] = useState<Phase>({ kind: "reviewing" });
  const [busyLabel, setBusyLabel] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // The snapshot. Built once, on open, and never recomputed while the dialog is up.
  const [intent] = useState(() => buildIntent(draft, assets));
  const [frozenAt] = useState(() => Date.now());
  const openedOn = useRef({ address, chainId: currentChainId });

  useEffect(() => setMounted(true), []);

  /* ---------------- focus, scroll and escape ---------------- */

  useEffect(() => {
    trigger.current = document.activeElement;
    const node = dialog.current;
    node?.focus();

    // Hide the page behind the dialog, and pay back the scrollbar's width so the sticky
    // header does not jump sideways as it disappears.
    const gap = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPad = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    if (gap > 0) document.body.style.paddingRight = `${gap}px`;

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPad;
      (trigger.current as HTMLElement | null)?.focus?.();
    };
  }, []);

  const close = useCallback(() => {
    // Never while signatures are in flight: there is no way to recall them, and a
    // dialog that vanishes mid-run leaves somebody watching a wallet with no idea what
    // it is asking about.
    if (submitting.current) return;
    onClose();
  }, [onClose]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        return;
      }
      if (event.key !== "Tab") return;

      // The trap. Without it Tab walks out of the dialog and into the page behind it,
      // which is still there and still focusable.
      const node = dialog.current;
      if (!node) return;
      const focusable = node.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  /* ---------------- invalidation ---------------- */

  useEffect(() => {
    // A wallet or network change makes the snapshot describe somebody else's account.
    // Not while running, though: the signatures are already out, and moving the phase
    // out from under them produces a screen that disagrees with the wallet.
    if (submitting.current) return;
    if (phase.kind === "running" || phase.kind === "done") return;
    const opened = openedOn.current;
    if (address !== opened.address) setPhase({ kind: "stale", why: "account" });
    else if (currentChainId !== opened.chainId) setPhase({ kind: "stale", why: "network" });
  }, [address, currentChainId, phase.kind]);

  /* ---------------- the deposits ---------------- */

  /*
   * Only stocks can be deposited, and this is not a UI preference.
   * `DripCore.deposit` takes a token the DividendRegistry has listed; an address
   * somebody pasted an hour ago is not on that list and the call would revert. So an
   * imported token stays in the picture and out of the batch, and the dialog says which
   * ones and why rather than quietly dropping them from a total.
   */
  const importedLines = intent.lines.filter((l) => l.kind === "token");
  const depositable = intent.lines.filter(
    (l) => l.kind === "stock" && l.shares !== null && l.shares > 0
  );
  const unpriced = intent.lines.filter((l) => l.priceUsd === null);
  const short = depositable.filter((l) => (wallet.stocks[l.assetId] ?? 0) < (l.shares ?? 0));

  const run = useCallback(async () => {
    /*
     * The capability, not the connection, decides whether this runs.
     *
     * A wallet connected to a network Osinko is not deployed on still reads the sample
     * account, and `actions.deposit` there writes to an in-memory store and returns
     * happily. Gating on `isConnected` alone would put "3 deposits are in" on screen for
     * something no chain has ever heard of. The sample account is a fine way to browse
     * the product; it is not a thing to sign off on.
     */
    if (capability.deposit.kind !== "in-kind") return;

    // Three guards, because each closes a different window. The ref is the one that
    // stops two clicks 8ms apart: state updates are asynchronous, so both would see
    // "reviewing" if the check were on phase alone.
    if (submitting.current) return;
    submitting.current = true;
    setPhase({ kind: "running" });

    let completed = 0;
    try {
      for (const line of depositable) {
        setBusyLabel(`${line.assetId} — ${fmt(line.shares ?? 0, 4)} shares`);
        await actions.deposit(line.assetId, line.shares ?? 0);
        completed += 1;
      }
      setPhase({ kind: "done" });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Something went wrong";
      // Partial is not failure. Deposits before the one that broke really landed, and
      // telling somebody their money did not move when it did is the worst outcome here.
      setPhase(
        completed > 0
          ? { kind: "partial", completed, reason: plain(reason) }
          : { kind: "failed", reason: plain(reason) }
      );
    } finally {
      submitting.current = false;
      setBusyLabel("");
    }
  }, [actions, depositable, capability.deposit.kind]);

  const saveCard = useCallback(async () => {
    setExporting(true);
    setExportError(null);
    try {
      await downloadStackCard({
        name: draft.name,
        ticker: draft.ticker,
        allocations: draft.allocations,
        names: Object.fromEntries([...assets].map(([id, a]) => [id, a.name])),
        symbols: Object.fromEntries([...assets].map(([id, a]) => [id, a.symbol])),
      });
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "The picture could not be made.");
    } finally {
      setExporting(false);
    }
  }, [draft, assets]);

  if (!mounted) return null;

  const running = phase.kind === "running";

  return createPortal(
    <div className="fixed inset-0 z-veil flex items-end justify-center sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-night/70 backdrop-blur-sm"
        onClick={close}
        aria-hidden
      />

      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stack-review-title"
        tabIndex={-1}
        className="dark-scroll panel relative flex max-h-[92vh] w-full max-w-[560px] flex-col overflow-y-auto rounded-b-none sm:rounded-xl"
      >
        <div className="panel-head sticky top-0 z-[1] bg-ground">
          <span className="panel-title" id="stack-review-title">
            {phase.kind === "done" || phase.kind === "partial"
              ? "What happened"
              : "Check it over"}
          </span>
          <button
            type="button"
            onClick={close}
            disabled={running}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-line text-faint transition-colors hover:text-ink disabled:opacity-30"
          >
            <span className="sr-only">Close</span>
            <svg viewBox="0 0 14 14" width="11" height="11" fill="none" aria-hidden>
              <path d="M3.5 3.5 10.5 10.5M10.5 3.5 3.5 10.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {phase.kind === "stale" ? (
            <Notice tone="warn">
              {phase.why === "account"
                ? "The wallet changed, so these numbers are for a different account."
                : "The network changed, so these numbers are for a different network."}{" "}
              <button
                type="button"
                className="underline decoration-2 underline-offset-4"
                onClick={onClose}
              >
                Go back and look again.
              </button>
            </Notice>
          ) : null}

          {phase.kind === "done" ? (
            <Notice tone="good">
              {depositable.length} {depositable.length === 1 ? "deposit is" : "deposits are"} in.
              They sit in your account as {depositable.length === 1 ? "one holding" : "separate holdings"} —
              there is no ${draft.ticker} token and no shared ticker on the network.
            </Notice>
          ) : null}

          {phase.kind === "partial" ? (
            <Notice tone="warn">
              {phase.completed} of {depositable.length} went in. The rest did not, and
              nothing was lost. {phase.reason}
            </Notice>
          ) : null}

          {phase.kind === "failed" ? <Notice tone="bad">{phase.reason}</Notice> : null}

          <StackPreviewCard
            name={draft.name}
            ticker={draft.ticker}
            allocations={draft.allocations}
            assets={assets}
          />

          {/* What it is made of, and what it would take to hold it. */}
          <div>
            <div className="serial mb-2">What is in it</div>
            <ul className="rounded-md border border-line">
              {intent.lines.map((line) => (
                <li
                  key={line.assetId}
                  className="flex items-center gap-3 border-b border-line-soft px-3 py-2.5 text-[13px] last:border-b-0"
                >
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: stackAccent(line.slot, line.kind) }}
                  />
                  <AssetMark
                    asset={assets.get(line.assetId) ?? { kind: line.kind, symbol: line.symbol }}
                    size={24}
                    slot={line.slot}
                  />
                  <span className="flex-1 truncate font-semibold text-ink">{line.symbol}</span>
                  <span className="num text-muted">{formatPct(line.weightBps)}%</span>
                  <span className="num w-[104px] text-right text-ink">
                    {line.kind === "token"
                      ? "token"
                      : line.shares === null
                        ? "—"
                        : `${fmt(line.shares, 4)} sh`}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <dl className="text-[13px]">
            <Row label="Drawn against">${fmt(draft.illustrativeUsd)}</Row>
            <Row label="Priced at">
              {new Date(frozenAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Row>
            <Row label="Network">{activeChain.name}</Row>
            <Row label="Fee">None from Osinko — the network charges its own</Row>
          </dl>

          {unpriced.length > 0 ? (
            <Notice tone="warn">
              There is no price right now for {unpriced.map((l) => l.assetId).join(", ")}, so
              the shares cannot be worked out. The rest is unaffected.
            </Notice>
          ) : null}

          {importedLines.length > 0 ? (
            <Notice tone="warn">
              {importedLines.map((l) => l.symbol).join(", ")}{" "}
              {importedLines.length === 1 ? "is a token you imported" : "are tokens you imported"}, so{" "}
              {importedLines.length === 1 ? "it stays" : "they stay"} in the picture but cannot be
              put on deposit — Osinko only takes the stocks it lists.
            </Notice>
          ) : null}

          {short.length > 0 && capability.deposit.kind === "in-kind" ? (
            <Notice tone="warn">
              This wallet holds less {short.map((l) => l.assetId).join(", ")} than the plan
              needs.
            </Notice>
          ) : null}

          {/* The honest statement about what a Stack is here. */}
          <p className="rounded-md border border-line bg-ground-3 px-3.5 py-3 text-[12px] leading-relaxed text-muted">
            A Stack is a plan and a picture. {capability.mint.reason} What you can do is put
            the stocks in it on deposit, one at a time, and they stay yours to take out
            whenever you like. Your split will drift as prices move.
          </p>
        </div>

        <div className="sticky bottom-0 space-y-2.5 border-t border-line bg-ground px-5 py-4">
          {running ? (
            <p className="num text-center text-[12px] text-muted">
              Signing — {busyLabel}
            </p>
          ) : null}

          <button
            type="button"
            className="btn-accent w-full"
            onClick={() => void saveCard()}
            disabled={exporting}
          >
            {exporting ? "Making the picture" : "Download the card"}
          </button>

          {exportError ? (
            <p className="text-center text-[12px] text-down">{exportError}</p>
          ) : null}

          {phase.kind !== "done" ? (
            <>
              <div className="pt-1">
                <div className="rule" aria-hidden />
              </div>
              {capability.deposit.kind === "in-kind" ? (
                <button
                  type="button"
                  className="btn-ghost w-full"
                  onClick={() => void run()}
                  disabled={
                    running ||
                    depositable.length === 0 ||
                    short.length > 0 ||
                    phase.kind === "stale"
                  }
                >
                  {running
                    ? "Waiting on your wallet"
                    : `Deposit ${depositable.length === 1 ? "this stock" : `these ${depositable.length}, one at a time`}`}
                </button>
              ) : (
                <p className="text-center text-[12px] leading-relaxed text-faint">
                  {isConnected
                    ? `Osinko is not switched on for ${activeChain.name} yet, so there is nowhere to put these. Saving and sharing the design still works.`
                    : "Connect a wallet to put these stocks on deposit. You do not need one to design or save a Stack."}
                </p>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ------------------------------------------------------------------ */

function buildIntent(
  draft: StackDraft,
  assets: ReadonlyMap<string, BuilderAsset>
): { lines: Line[] } {
  const lines: Line[] = draft.allocations.map((a: Allocation) => {
    const asset = assets.get(a.assetId);
    const price = asset?.priceUsd ?? null;
    const usd = (draft.illustrativeUsd * a.weightBps) / TOTAL_BPS;
    const shares = price !== null && price > 0 ? usd / price : null;
    return {
      assetId: a.assetId,
      kind: a.kind,
      symbol: asset?.symbol ?? a.assetId,
      weightBps: a.weightBps,
      slot: a.slot,
      priceUsd: price,
      usd,
      shares,
      actualBps: null,
    };
  });

  return { lines };
}

/** Wallet errors, said the way a person would say them. */
function plain(message: string): string {
  if (/rejected|denied/i.test(message)) return "You closed the wallet before signing.";
  if (/gas|insufficient funds/i.test(message)) return "This wallet cannot cover the network fee.";
  if (/reverted/i.test(message)) return "The network turned that one down.";
  return message.length > 140 ? `${message.slice(0, 137)}…` : message;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-2 last:border-b-0">
      <dt className="text-micro font-bold uppercase text-muted">{label}</dt>
      <dd className="num text-right text-ink">{children}</dd>
    </div>
  );
}

function Notice({ tone, children }: { tone: "good" | "warn" | "bad"; children: React.ReactNode }) {
  const style =
    tone === "good"
      ? "border-accent/40 bg-accent/10 text-ink"
      : tone === "bad"
        ? "border-down/40 bg-down/10 text-ink"
        : "border-line bg-ground-3 text-muted";
  return (
    <p className={`rounded-md border px-3.5 py-3 text-[13px] leading-relaxed ${style}`}>
      {children}
    </p>
  );
}
