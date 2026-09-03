/**
 * Intrinsic pixel sizes of the screenshots in public/docs, captured at 2x from the
 * running demo. Written by the capture script; edit by recapturing, not by hand.
 */
export const SHOTS = {
  dashboard: { width: 2176, height: 1176 },
  "deposit-modes": { width: 1243, height: 366 },
  "deposit-summary": { width: 869, height: 880 },
  vault: { width: 2176, height: 461 },
  borrow: { width: 2176, height: 1198 },
  split: { width: 2176, height: 1088 },
  agent: { width: 2176, height: 975 },
  calendar: { width: 2176, height: 1285 },
  certificate: { width: 1051, height: 1133 },
  universe: { width: 2656, height: 2074 },
} as const;
