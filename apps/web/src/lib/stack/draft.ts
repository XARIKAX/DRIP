/**
 * Saving a Stack you have not finished.
 *
 * The first persistence in this codebase, so it sets the convention rather than
 * following one. Three rules it holds to:
 *
 * **Only what a person typed.** Names, tickers, the list of stocks in order, the shares
 * they set, the illustrative figure. Never a price, a balance, a share count, a wallet
 * address, a transaction, or anything derived from chain state. A price written down
 * today and read back next week is a stale number wearing a fact's clothes, and this
 * codebase is unusually careful about that distinction — `TokenInfo.priceUsd` is
 * `number | null` precisely so a quiet feed cannot be mistaken for a worthless stock.
 * Everything derived is recomputed live on restore, or shows a dash.
 *
 * **Nothing implying ownership.** A draft never records that a deposit happened.
 * Whether stock is on deposit is chain state, and a local file claiming otherwise would
 * be the worst lie this feature could tell.
 *
 * **It may simply not work.** Storage throws in more situations than people expect, and
 * every one of them is somebody's ordinary Tuesday. The builder is fully usable with
 * persistence dead; it just says so once and gets out of the way.
 */

import { normalise, type Allocation } from "./allocation";

export const DRAFT_VERSION = 1;
const KEY = "osinko.stack.drafts.v1";
const MAX_DRAFTS = 8;
/** Comfortably past eight drafts, and far short of any browser's quota. */
const MAX_BYTES = 32_000;

export interface StackDraft {
  id: string;
  name: string;
  ticker: string;
  allocations: Allocation[];
  /** The figure the summary is drawn against. A illustration, never a balance. */
  illustrativeUsd: number;
  createdAt: number;
  updatedAt: number;
}

interface DraftFile {
  v: number;
  drafts: StackDraft[];
  activeId: string | null;
}

const EMPTY: DraftFile = { v: DRAFT_VERSION, drafts: [], activeId: null };

/* ------------------------------------------------------------------ */
/* Getting at storage at all                                           */
/* ------------------------------------------------------------------ */

/** `undefined` means not probed yet; `null` means probed and unavailable. */
let cached: Storage | null | undefined;

/**
 * Storage, or null.
 *
 * Two separate failure points, and a probe that only covers one of them is a crash
 * waiting for the right browser. Some configurations throw on *reading*
 * `window.localStorage` at all; Safari's private mode hands back a real object that
 * throws on the first `setItem`. So the probe touches both, and memoises, because doing
 * this on every keystroke would be its own kind of silly.
 */
function storage(): Storage | null {
  if (cached !== undefined) return cached;
  try {
    if (typeof window === "undefined") return (cached = null);
    const ls = window.localStorage;
    const probe = "__osinko_probe";
    ls.setItem(probe, "1");
    ls.removeItem(probe);
    return (cached = ls);
  } catch {
    return (cached = null);
  }
}

/** Whether this browser will keep anything. The UI says so once, quietly. */
export function canPersist(): boolean {
  return storage() !== null;
}

/* ------------------------------------------------------------------ */
/* Reading                                                            */
/* ------------------------------------------------------------------ */

function isDraft(value: unknown): value is StackDraft {
  if (typeof value !== "object" || value === null) return false;
  const d = value as Partial<StackDraft>;
  return (
    typeof d.id === "string" &&
    typeof d.name === "string" &&
    typeof d.ticker === "string" &&
    Array.isArray(d.allocations)
  );
}

/**
 * Everything saved, repaired on the way out.
 *
 * Anything stored is eventually something a browser truncated, a person hand-edited, or
 * a build that no longer exists wrote. So nothing here is trusted: the JSON is parsed in
 * a guard, the shape is checked by hand (no schema library — this does not need to
 * become a dependency), and every allocation array goes through `normalise`, which
 * cannot return anything the builder's own rules forbid.
 *
 * A *higher* version number is left alone rather than overwritten. A newer build open in
 * another tab must not lose its work to an older one that happened to load second.
 */
export function readDrafts(): DraftFile {
  const ls = storage();
  if (!ls) return EMPTY;

  try {
    const raw = ls.getItem(KEY);
    if (!raw) return EMPTY;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return EMPTY;

    const file = parsed as Partial<DraftFile>;
    if (typeof file.v === "number" && file.v > DRAFT_VERSION) return EMPTY;

    const drafts = (Array.isArray(file.drafts) ? file.drafts : [])
      .filter(isDraft)
      .slice(0, MAX_DRAFTS)
      .map((d) => ({
        id: d.id,
        name: String(d.name).slice(0, 40),
        ticker: String(d.ticker).slice(0, 10),
        allocations: normalise(d.allocations),
        illustrativeUsd:
          Number.isFinite(d.illustrativeUsd) && d.illustrativeUsd > 0 ? d.illustrativeUsd : 1000,
        createdAt: Number(d.createdAt) || Date.now(),
        updatedAt: Number(d.updatedAt) || Date.now(),
      }))
      .filter((d) => d.allocations.length > 0);

    const activeId =
      typeof file.activeId === "string" && drafts.some((d) => d.id === file.activeId)
        ? file.activeId
        : null;

    return { v: DRAFT_VERSION, drafts, activeId };
  } catch {
    // Corrupt, truncated, or something else entirely. Treat it as empty and let the
    // next write replace it; refusing to start is not a kindness.
    return EMPTY;
  }
}

/**
 * The draft to open on, or null for the empty state.
 *
 * Restore beats the invitation: somebody who left a Stack half-built wants it back, not
 * a fresh canvas asking them to start again.
 */
export function readActiveDraft(): StackDraft | null {
  const file = readDrafts();
  if (file.drafts.length === 0) return null;
  const active = file.drafts.find((d) => d.id === file.activeId);
  if (active) return active;
  return [...file.drafts].sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* Writing                                                            */
/* ------------------------------------------------------------------ */

function write(file: DraftFile): boolean {
  const ls = storage();
  if (!ls) return false;
  try {
    const json = JSON.stringify(file);
    // Refuse rather than throw at the quota, which on some browsers takes the whole
    // key with it and loses every other draft too.
    if (json.length > MAX_BYTES) return false;
    ls.setItem(KEY, json);
    return true;
  } catch {
    return false;
  }
}

/** Save a draft, replacing one with the same id. Oldest is dropped past the cap. */
export function saveDraft(draft: StackDraft): boolean {
  const file = readDrafts();
  const rest = file.drafts.filter((d) => d.id !== draft.id);
  const next = [{ ...draft, updatedAt: Date.now() }, ...rest]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_DRAFTS);
  return write({ v: DRAFT_VERSION, drafts: next, activeId: draft.id });
}

export function deleteDraft(id: string): boolean {
  const file = readDrafts();
  const drafts = file.drafts.filter((d) => d.id !== id);
  return write({
    v: DRAFT_VERSION,
    drafts,
    activeId: file.activeId === id ? null : file.activeId,
  });
}

export function setActiveDraft(id: string | null): boolean {
  const file = readDrafts();
  return write({ ...file, v: DRAFT_VERSION, activeId: id });
}

/**
 * A debounced save shared by every caller.
 *
 * Module-level rather than per-component on purpose: three components editing one draft
 * should share one timer, not race three of them into three writes of three slightly
 * different states.
 */
let timer: ReturnType<typeof setTimeout> | null = null;
let pending: StackDraft | null = null;

export function saveDraftSoon(draft: StackDraft, delayMs = 400): void {
  pending = draft;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    if (pending) saveDraft(pending);
    pending = null;
  }, delayMs);
}

/**
 * Write anything outstanding right now.
 *
 * Bound to `visibilitychange` and `pagehide` rather than `beforeunload`, which does not
 * fire reliably when a phone backgrounds the browser — and a phone backgrounding the
 * browser is exactly when somebody loses the thing they were building.
 */
export function flushDraft(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  if (pending) saveDraft(pending);
  pending = null;
}

export function newDraftId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }
}
