"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePublicClient } from "wagmi";

import { fmt } from "@/components/live";
import { isAddress, shortAddress, type BuilderAsset } from "@/lib/stack/asset";
import { EXAMPLE_TOKENS, lookupToken, type ChainReader } from "@/lib/stack/lookup";
import { AssetMark } from "./AssetMark";

/**
 * Bring your own token.
 *
 * The widest thing on the page, and above the three columns rather than inside one,
 * because it changes what the builder *is*: up to here a Stack was assembled from a
 * shelf somebody else stocked, and this is the part where anything with a contract
 * address can join it. A control that does that should not be a row in a sidebar.
 *
 * The beam between the field and the card is the whole idea in one gesture — you paste
 * on the left, something with a name and a face arrives on the right. It only runs while
 * a lookup is in flight, so it reads as the thing travelling rather than as decoration.
 */

export interface TokenImportPanelProps {
  /** Already in the Stack, so the card can say so instead of offering a duplicate. */
  heldIds: readonly string[];
  full: boolean;
  onAdd: (asset: BuilderAsset) => void;
  /** Lets the found token be dragged into the ring, like any other asset. */
  onPointerDown?: (event: React.PointerEvent, assetId: string) => void;
}

type Phase =
  | { kind: "idle" }
  | { kind: "looking" }
  | { kind: "found"; asset: BuilderAsset; source: "index" | "chain" }
  | { kind: "failed"; reason: string };

export function TokenImportPanel({
  heldIds,
  full,
  onAdd,
  onPointerDown,
}: TokenImportPanelProps) {
  const [address, setAddress] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [copied, setCopied] = useState(false);
  const client = usePublicClient();
  const inFlight = useRef<AbortController | null>(null);

  /**
   * The chain fallback, for a token no index has heard of.
   *
   * `usePublicClient` needs no wallet — it is the RPC the app is already configured
   * against — so this works for a visitor who has never connected anything.
   */
  const reader: ChainReader | undefined = client
    ? {
        async read(addr) {
          const erc20 = [
            { name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
            { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
          ] as const;
          const [name, symbol] = await Promise.all([
            client.readContract({ address: addr as `0x${string}`, abi: erc20, functionName: "name" }),
            client.readContract({ address: addr as `0x${string}`, abi: erc20, functionName: "symbol" }),
          ]);
          return { name: String(name), symbol: String(symbol) };
        },
      }
    : undefined;

  const look = useCallback(
    async (raw: string) => {
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;

      setPhase({ kind: "looking" });
      const result = await lookupToken(raw, { reader, signal: controller.signal });
      if (controller.signal.aborted) return;

      setPhase(
        result.ok
          ? { kind: "found", asset: result.asset, source: result.source }
          : { kind: "failed", reason: result.reason }
      );
    },
    // `reader` is rebuilt every render; depending on it would restart every lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client]
  );

  useEffect(() => () => inFlight.current?.abort(), []);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);

  const found = phase.kind === "found" ? phase.asset : null;
  const held = found ? heldIds.includes(found.id) : false;
  const canLook = isAddress(address) && phase.kind !== "looking";

  return (
    <section className="panel relative overflow-hidden" aria-label="Import a token">
      {/* The violet field this panel sits in. Empty and behind everything, because it
          is blurred and nothing blurred here is ever allowed to contain text. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 120% at 12% 0%, rgb(var(--iris-500) / 0.22), transparent 62%), radial-gradient(48% 110% at 88% 50%, rgb(var(--iris-400) / 0.18), transparent 70%)",
        }}
      />
      <div aria-hidden className="stack-grid pointer-events-none absolute inset-0 [--cell:4px] opacity-40" />

      <div className="relative grid gap-8 px-6 py-7 md:px-8 md:py-9 lg:grid-cols-[1.15fr_auto_360px] lg:items-center lg:gap-6">
        {/* ---- the pitch and the field ---- */}
        <div className="min-w-0">
          {/* Named, not read from the env: the lookup queries Robinhood Chain's index
              whatever chain this build is otherwise pointed at, so echoing the env here
              would promise a different network than the one being searched. */}
          <div className="serial">
            Token import <span className="text-ghost">/</span> Robinhood Chain
          </div>

          <h2 className="mt-3 display text-[clamp(28px,3.6vw,46px)] leading-[1.02] tracking-cut text-ink">
            Bring your own token.
          </h2>
          <p className="mt-2.5 text-[14px] leading-relaxed text-muted">
            Paste a contract address. Make it part of your Stack.
          </p>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <label htmlFor="token-address" className="sr-only">
                Token contract address on Robinhood Chain
              </label>
              <svg
                viewBox="0 0 16 16"
                width="15"
                height="15"
                fill="none"
                aria-hidden
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint"
              >
                <path
                  d="M6.4 9.6a2.6 2.6 0 0 0 3.7 0l2.3-2.3a2.6 2.6 0 0 0-3.7-3.7l-.6.6M9.6 6.4a2.6 2.6 0 0 0-3.7 0L3.6 8.7a2.6 2.6 0 0 0 3.7 3.7l.6-.6"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
              <input
                id="token-address"
                className="field num py-3 pl-11 pr-10 text-[13px]"
                placeholder="0x…"
                spellCheck={false}
                autoComplete="off"
                value={address}
                onChange={(e) => {
                  setAddress(e.target.value.trim());
                  if (phase.kind !== "idle") setPhase({ kind: "idle" });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canLook) void look(address);
                }}
              />
              {address ? (
                <button
                  type="button"
                  onClick={() => {
                    setAddress("");
                    setPhase({ kind: "idle" });
                  }}
                  className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-faint transition-colors hover:bg-ground-3 hover:text-ink"
                >
                  <span className="sr-only">Clear the address</span>
                  <svg viewBox="0 0 12 12" width="10" height="10" fill="none" aria-hidden>
                    <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
              ) : null}
            </div>

            <button
              type="button"
              className="btn-accent shrink-0 px-7"
              disabled={!canLook}
              onClick={() => void look(address)}
            >
              {phase.kind === "looking" ? "Looking…" : "Look up token"}
            </button>
          </div>

          <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="serial">Try one</span>
            {EXAMPLE_TOKENS.map((t) => (
              <button
                key={t.address}
                type="button"
                className="text-micro font-bold uppercase text-accent underline decoration-accent/30 decoration-2 underline-offset-4 transition-colors hover:decoration-accent"
                onClick={() => {
                  setAddress(t.address);
                  void look(t.address);
                }}
              >
                {t.symbol}
              </button>
            ))}
          </div>

          {phase.kind === "failed" ? (
            <p role="status" className="mt-3 text-[13px] leading-relaxed text-down">
              {phase.reason}
            </p>
          ) : null}
        </div>

        {/* ---- the beam ---- */}
        <div aria-hidden className="relative hidden h-px self-center lg:block lg:w-[72px]">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-accent/40 to-accent/60" />
          {phase.kind === "looking" ? <div className="stack-beam absolute inset-y-0 w-10" /> : null}
        </div>

        {/* ---- what came back ---- */}
        <div className="min-w-0">
          {found ? (
            <FoundCard
              asset={found}
              source={phase.kind === "found" ? phase.source : "index"}
              held={held}
              full={full}
              copied={copied}
              onCopy={() => {
                void navigator.clipboard?.writeText(found.address ?? "").then(() => setCopied(true));
              }}
              onAdd={() => onAdd(found)}
              onPointerDown={onPointerDown}
            />
          ) : (
            <EmptyCard looking={phase.kind === "looking"} />
          )}
        </div>
      </div>
    </section>
  );
}

/** The slot the found token will land in, so the panel does not jump when it arrives. */
function EmptyCard({ looking }: { looking: boolean }) {
  return (
    <div className="flex min-h-[188px] flex-col items-center justify-center rounded-lg border border-dashed border-line px-5 py-6 text-center">
      <span
        aria-hidden
        className={`flex h-11 w-11 items-center justify-center rounded-full border border-line text-faint ${
          looking ? "stack-halo" : ""
        }`}
      >
        <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden>
          <path
            d="M10 2.6 16.4 10 10 17.4 3.6 10 10 2.6Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <p className="mt-3 text-[13px] leading-relaxed text-muted">
        {looking ? "Reading the contract…" : "Whatever you paste shows up here."}
      </p>
    </div>
  );
}

function FoundCard({
  asset,
  source,
  held,
  full,
  copied,
  onCopy,
  onAdd,
  onPointerDown,
}: {
  asset: BuilderAsset;
  source: "index" | "chain";
  held: boolean;
  full: boolean;
  copied: boolean;
  onCopy: () => void;
  onAdd: () => void;
  onPointerDown?: (event: React.PointerEvent, assetId: string) => void;
}) {
  return (
    <div
      className="stack-found relative rounded-lg border p-4"
      style={{
        borderColor: "rgb(var(--accent) / 0.55)",
        background: "rgb(var(--night-1) / 0.72)",
        boxShadow: "0 0 0 1px rgb(var(--accent) / 0.12), 0 20px 50px -26px rgb(var(--iris-500) / 0.9)",
      }}
      onPointerDown={(e) => {
        if (held || full || !onPointerDown) return;
        onPointerDown(e, asset.id);
      }}
    >
      <span
        className="absolute -top-2.5 right-4 flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-nano font-medium uppercase tracking-widest"
        style={{
          borderColor: "rgb(var(--accent) / 0.4)",
          background: "rgb(var(--night-1))",
          color: "rgb(var(--accent))",
        }}
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
        {source === "index" ? "Metadata loaded" : "Read from chain"}
      </span>

      <div className="flex items-center gap-3">
        <AssetMark asset={asset} size={44} slot={0} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] font-extrabold tracking-tight text-ink">
            {asset.symbol}
          </div>
          <div className="truncate text-[12px] text-muted">{asset.name}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="num text-[14px] font-semibold text-ink">
            {asset.priceUsd === null ? "—" : `$${fmt(asset.priceUsd, asset.priceUsd < 1 ? 6 : 2)}`}
          </div>
          <div className="serial">{asset.priceUsd === null ? "No price" : "Price"}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onCopy}
          className="num flex min-w-0 items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[11px] text-muted transition-colors hover:border-accent/50 hover:text-ink"
        >
          <span className="truncate">{shortAddress(asset.address ?? "")}</span>
          <span aria-hidden className="shrink-0">
            {copied ? "✓" : "⧉"}
          </span>
          <span className="sr-only">Copy the contract address</span>
        </button>
        <span className="ml-auto shrink-0 rounded-full border border-line px-2.5 py-1 text-nano font-medium uppercase tracking-widest text-faint">
          Custom asset
        </span>
      </div>

      <button
        type="button"
        className="btn-accent mt-3.5 w-full"
        disabled={held || full}
        onClick={onAdd}
      >
        {held ? "Already in your Stack" : full ? "Your Stack is full" : "Add to Stack"}
      </button>
      <p className="mt-2 text-center text-[11px] text-faint">
        {held || full ? " " : "or drag it into the ring"}
      </p>
    </div>
  );
}
