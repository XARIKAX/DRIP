"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "wagmi";

import { AllocationChamber } from "@/components/builder/AllocationChamber";
import { AllocationControls, holdingsSentence } from "@/components/builder/AllocationControls";
import { AssetLibrary } from "@/components/builder/AssetLibrary";
import { DragGhost } from "@/components/builder/DragGhost";
import { DraftStrip } from "@/components/builder/DraftStrip";
import { ReviewDialog } from "@/components/builder/ReviewDialog";
import { StackIdentityForm, isReady } from "@/components/builder/StackIdentityForm";
import { TokenImportPanel } from "@/components/builder/TokenImportPanel";
import { useDragToRing } from "@/components/builder/useDragToRing";
import { useTokensView } from "@/lib/data/provider";
import { stockAsset, tokenAsset, type BuilderAsset } from "@/lib/stack/asset";
import { lookupToken } from "@/lib/stack/lookup";
import {
  addAsset,
  MAX_ASSETS,
  normalise,
  removeAsset,
  setWeight,
  type Allocation,
} from "@/lib/stack/allocation";
import { resolveCapability } from "@/lib/stack/capability";
import {
  canPersist,
  flushDraft,
  newDraftId,
  readActiveDraft,
  saveDraft,
  saveDraftSoon,
  type ImportedToken,
  type StackDraft,
} from "@/lib/stack/draft";

/**
 * Build a Stack.
 *
 * Three panels and one piece of state. Everything on this screen — the ring, the
 * sliders, the percentage fields, the card, the review — is drawn from the single
 * `draft` object below. There is deliberately no second copy of a weight anywhere: the
 * moment two components each hold "50" is the moment a portfolio starts adding up to
 * 101%, and the number this page is loudest about is the one that says 100%.
 *
 * It works with no wallet. The stock list comes from the app's own data seam, which
 * answers the sample account for a visitor and the live listing for a connected one, so
 * nothing here is invented either way. Imported tokens come from a contract address
 * somebody pasted, and their prices are looked up live rather than remembered — see
 * `lib/stack/draft.ts` for why identity is stored and value never is.
 *
 * Served at /build rather than under /app, and absent from the nav on purpose — this is
 * shown to people by sending them the link. `layout.tsx` beside this file carries that
 * decision and the `robots` directive that goes with it; read its header before moving
 * this page or adding a link to it.
 */

const EXAMPLE = {
  name: "The Robot Economy",
  ticker: "ROBOT",
  /*
   * Built in one go rather than by adding three stocks and then setting three weights.
   * Setting them in sequence does not land on 50/30/20: each `setWeight` rescales the
   * holdings it is not editing, so the first two get nudged by the third and the ring
   * comes out at 48.7/31.3/20. `normalise` takes the weights as given and only has to
   * settle the rounding, which on these three is exact.
   */
  allocations: [
    { assetId: "NVDA", weightBps: 5000 },
    { assetId: "TSLA", weightBps: 3000 },
    { assetId: "MSFT", weightBps: 2000 },
  ],
};

function blankDraft(): StackDraft {
  return {
    id: newDraftId(),
    name: "",
    ticker: "",
    allocations: [],
    imported: [],
    illustrativeUsd: 1000,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export default function BuilderPage() {
  const tokens = useTokensView();
  const { isConnected } = useAccount();
  const capability = useMemo(() => resolveCapability(isConnected), [isConnected]);

  /*
   * A lazy initialiser rather than an effect, so a restored Stack is on screen in the
   * first paint instead of flashing the empty state and popping in. That is only safe
   * because the whole app is mounted client-side (`components/providers.tsx` loads the
   * wallet stack with `ssr: false`), so there is no server render for this to disagree
   * with. Do not copy this into a server-rendered tree.
   */
  const [draft, setDraft] = useState<StackDraft>(() => readActiveDraft() ?? blankDraft());
  const [bumped, setBumped] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [persists, setPersists] = useState(true);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const firstRender = useRef(true);

  /*
   * Prices for imported tokens, keyed by address.
   *
   * Deliberately not in the draft. A draft keeps identity, which is stable, and never a
   * figure, which is not — so a restored Stack re-reads what its tokens are worth rather
   * than printing what they were worth whenever it was last open. Until the answer
   * lands, the price is null and the UI shows a dash, exactly as it does for a stock
   * whose feed has gone quiet.
   */
  const [tokenPrices, setTokenPrices] = useState<Record<string, number | null>>({});

  /** Every asset the builder can offer, both shelves, keyed by allocation id. */
  const assets = useMemo(() => {
    const map = new Map<string, BuilderAsset>();
    for (const t of tokens) {
      const a = stockAsset(t);
      map.set(a.id, a);
    }
    for (const t of draft.imported) {
      const a = tokenAsset({ ...t, priceUsd: tokenPrices[t.address] ?? null });
      map.set(a.id, a);
    }
    return map;
  }, [tokens, draft.imported, tokenPrices]);

  const assetList = useMemo(() => [...assets.values()], [assets]);

  const names = useMemo(
    () => Object.fromEntries(assetList.map((a) => [a.id, a.name])),
    [assetList]
  );

  // Refresh anything imported that has no price yet. One pass per new token, not a poll:
  // this is a builder, not a ticker, and a price that moves under a slider is noise.
  useEffect(() => {
    const missing = draft.imported.filter((t) => tokenPrices[t.address] === undefined);
    if (missing.length === 0) return;
    let live = true;
    void Promise.all(
      missing.map(async (t) => {
        const r = await lookupToken(t.address);
        return [t.address, r.ok ? r.asset.priceUsd : null] as const;
      })
    ).then((pairs) => {
      if (live) setTokenPrices((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
    });
    return () => {
      live = false;
    };
  }, [draft.imported, tokenPrices]);

  useEffect(() => setPersists(canPersist()), []);

  // Autosave, but never write the restored value straight back as though it were an
  // edit — the first render is a read, not a change.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (draft.allocations.length > 0) saveDraftSoon(draft);
  }, [draft]);

  // A phone backgrounding the browser is exactly when somebody loses their work, and
  // `beforeunload` is the one event that does not fire reliably when it happens.
  useEffect(() => {
    const flush = () => flushDraft();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flush);
      flushDraft();
    };
  }, []);

  const patch = useCallback((next: Partial<StackDraft>) => {
    setSaved(false);
    setDraft((d) => ({ ...d, ...next, updatedAt: Date.now() }));
  }, []);

  const announce = useCallback(
    (allocations: readonly Allocation[], line: string) => {
      setAnnouncement(`${line} ${holdingsSentence(allocations, names)}`);
    },
    [names]
  );

  const add = useCallback(
    (asset: BuilderAsset) => {
      setDraft((d) => {
        if (d.allocations.some((a) => a.assetId === asset.id)) {
          // Already in. Pulse the badge it is on rather than doing nothing silently.
          setBumped(asset.id);
          setAnnouncement(`${asset.symbol} is already in your Stack.`);
          return d;
        }
        if (d.allocations.length >= MAX_ASSETS) {
          setAnnouncement(`A Stack holds ${MAX_ASSETS} assets. Take one out to add another.`);
          return d;
        }

        const allocations = addAsset(d.allocations, asset.id, asset.kind);
        // An imported token brings its own identity into the draft, because nothing else
        // knows it: there is no registry to look it up in after a reload.
        const imported: ImportedToken[] =
          asset.kind === "token" && asset.address && !d.imported.some((t) => t.address === asset.id)
            ? [
                ...d.imported,
                { address: asset.id, symbol: asset.symbol, name: asset.name, logoUrl: asset.logoUrl },
              ]
            : d.imported;

        if (asset.kind === "token" && asset.priceUsd !== undefined) {
          setTokenPrices((prev) => ({ ...prev, [asset.id]: asset.priceUsd }));
        }

        announce(allocations, `${asset.symbol} added.`);
        setSaved(false);
        return { ...d, allocations, imported, updatedAt: Date.now() };
      });
    },
    [announce]
  );

  /** Import without adding: it lands on the Imported shelf, ready to drag. */
  const shelve = useCallback((asset: BuilderAsset) => {
    if (!asset.address) return;
    setTokenPrices((prev) => ({ ...prev, [asset.id]: asset.priceUsd }));
    setDraft((d) =>
      d.imported.some((t) => t.address === asset.id)
        ? d
        : {
            ...d,
            imported: [
              ...d.imported,
              { address: asset.id, symbol: asset.symbol, name: asset.name, logoUrl: asset.logoUrl },
            ],
            updatedAt: Date.now(),
          }
    );
  }, []);

  const remove = useCallback(
    (assetId: string) => {
      setDraft((d) => {
        const allocations = removeAsset(d.allocations, assetId);
        if (allocations === d.allocations) return d;
        // The token stays on the Imported shelf — taking it out of the ring is not the
        // same as un-importing it, and re-pasting the address would be a chore.
        announce(allocations, `${names[assetId] ?? assetId} taken out.`);
        setSaved(false);
        return { ...d, allocations, updatedAt: Date.now() };
      });
    },
    [announce, names]
  );

  /*
   * The baseline matters. A slider drag calls this sixty times a second, and rescaling
   * the already-rescaled array each time lets the untouched holdings drift against one
   * another a basis point per frame. The controls freeze the array as the drag begins
   * and hand back that same one every frame, so one drag is one edit however many
   * events it emits.
   */
  const reweight = useCallback(
    (assetId: string, weightBps: number, baseline: readonly Allocation[]) => {
      setSaved(false);
      setDraft((d) => ({
        ...d,
        allocations: setWeight(baseline as Allocation[], assetId, weightBps),
        updatedAt: Date.now(),
      }));
    },
    []
  );

  const loadExample = useCallback(() => {
    const allocations = normalise(EXAMPLE.allocations);
    void allocations;
    setSaved(false);
    setDraft((d) => ({
      ...d,
      name: EXAMPLE.name,
      ticker: EXAMPLE.ticker,
      allocations,
      updatedAt: Date.now(),
    }));
    announce(allocations, "Example loaded. It is a suggestion, not something you hold.");
  }, [announce]);

  const reset = useCallback(() => {
    setDraft(blankDraft());
    setAnnouncement("Cleared. Your Stack is empty.");
  }, []);

  const addById = useCallback(
    (assetId: string) => {
      const asset = assets.get(assetId);
      if (asset) add(asset);
    },
    [assets, add]
  );

  const drag = useDragToRing({ onDrop: addById });

  // Clear the duplicate-drop pulse once it has played.
  useEffect(() => {
    if (!bumped) return;
    const t = setTimeout(() => setBumped(null), 420);
    return () => clearTimeout(t);
  }, [bumped]);

  const ready = isReady(draft.name, draft.ticker, draft.allocations);

  return (
    <div className="space-y-6">
      <header className="max-w-3xl">
        <div className="serial">Build a Stack</div>
        <h1 className="mt-3 display text-display">Your thesis. Your ticker.</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          Combine stocks and tokens. Build something of your own.
        </p>
      </header>

      <DraftStrip
        currentId={draft.id}
        persists={persists}
        onRestore={(d) => {
          flushDraft();
          setDraft(d);
          setAnnouncement(`Opened ${d.name || "a saved Stack"}.`);
        }}
        onReset={reset}
        hasWork={draft.allocations.length > 0}
      />

      <TokenImportPanel
        heldIds={draft.allocations.map((a) => a.assetId)}
        full={draft.allocations.length >= MAX_ASSETS}
        onAdd={(asset) => {
          shelve(asset);
          add(asset);
        }}
        onPointerDown={(event, assetId) => {
          const asset = assets.get(assetId);
          // Shelve before the drag starts, so the drop has something to resolve.
          if (!asset) {
            const found = draft.allocations.find((a) => a.assetId === assetId);
            void found;
          }
          drag.onPointerDown(event, assetId);
        }}
      />

      {/*
       * Source order is the desktop reading order — pick, compose, name — and on one
       * column that is wrong: it buries the ring under eight stock rows, so the first
       * thing a phone shows is a list rather than the thing worth looking at. Below lg
       * the chamber comes first and the shelf follows it.
       */}
      <div className="grid gap-5 lg:grid-cols-12 xl:gap-6">
        <div className="order-2 lg:order-none lg:col-span-4 xl:col-span-3">
          <AssetLibrary
            ref={searchRef}
            assets={assetList}
            allocations={draft.allocations}
            onAdd={add}
            onRemove={remove}
            onPointerDown={drag.onPointerDown}
            draggingAssetId={drag.state.assetId}
          />
        </div>

        <div className="order-1 lg:order-none lg:col-span-8 xl:col-span-6">
          <section className="panel" aria-label="Compose your Stack" data-shot="builder">
            <div className="panel-head">
              <span className="panel-title">
                <span className="hidden lg:inline">02 / </span>Compose your Stack
              </span>
              <span className="flex items-center gap-2 text-micro font-bold uppercase text-faint">
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full bg-accent"
                />
                Live preview
              </span>
            </div>

            <div ref={drag.setDropTarget}>
              <AllocationChamber
                allocations={draft.allocations}
                assets={assets}
                ticker={draft.ticker}
                dropActive={drag.state.over}
                bumpedAssetId={bumped}
                onRequestAdd={() => searchRef.current?.focus()}
                onTryExample={loadExample}
              />
            </div>

            <AllocationControls
              allocations={draft.allocations}
              names={names}
              symbols={Object.fromEntries(assetList.map((a) => [a.id, a.symbol]))}
              onSetWeight={reweight}
              onRemove={remove}
            />
          </section>
        </div>

        <div className="order-3 lg:order-none lg:col-span-12 xl:col-span-3">
          <StackIdentityForm
            name={draft.name}
            ticker={draft.ticker}
            illustrativeUsd={draft.illustrativeUsd}
            allocations={draft.allocations}
            tokens={tokens}
            assets={assets}
            capability={capability}
            saving={saved}
            onName={(name) => patch({ name })}
            onTicker={(ticker) => patch({ ticker })}
            onIllustrativeUsd={(illustrativeUsd) => patch({ illustrativeUsd })}
            onReview={() => setReviewing(true)}
            onSaveDraft={() => {
              flushDraft();
              if (draft.allocations.length > 0 && saveDraft(draft)) setSaved(true);
            }}
          />
        </div>
      </div>

      {reviewing && ready ? (
        <ReviewDialog
          draft={draft}
          tokens={tokens}
          assets={assets}
          capability={capability}
          onClose={() => setReviewing(false)}
        />
      ) : null}

      <DragGhost assetId={drag.state.assetId} x={drag.state.x} y={drag.state.y} />

      {/* One polite region for everything. Announcing per frame would be unusable. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
