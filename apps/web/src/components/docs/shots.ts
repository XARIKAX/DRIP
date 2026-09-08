/**
 * Intrinsic pixel sizes of the screenshots in public/docs, captured at 2x from the
 * running demo. Written by scripts/capture-shots.mjs; edit by recapturing, not by hand.
 */
export const SHOTS = {
  hero: { width: 2828, height: 1948 },
  dashboard: { width: 2736, height: 2569 },
  "deposit-modes": { width: 1587, height: 430 },
  "deposit-summary": { width: 1133, height: 951 },
  vault: { width: 2736, height: 557 },
  borrow: { width: 2736, height: 412 },
  split: { width: 2736, height: 2367 },
  calendar: { width: 2736, height: 1439 },
  agent: { width: 2736, height: 1055 },
  universe: { width: 2736, height: 2199 },
} as const;
