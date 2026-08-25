/**
 * Formatting rules, in one place, because the design system has opinions:
 * every number is IBM Plex Mono, streaming values carry four decimals, and
 * nothing is ever rendered with a currency symbol glued to a raw bigint.
 */

const USDG_DECIMALS = 6;
const STOCK_DECIMALS = 18;

/** Fixed point bigint to number. Precision loss is acceptable for display only. */
export function toNumber(value: bigint, decimals: number): number {
  return Number(value) / 10 ** decimals;
}

/** USDG with two decimals. For totals and balances. */
export function formatUsdg(value: bigint, decimals = 2): string {
  return toNumber(value, USDG_DECIMALS).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** USDG with four decimals. For anything that ticks. */
export function formatStreaming(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

/** Stock token amount. Four decimals, because reinvestment buys fractions. */
export function formatStock(value: bigint, decimals = 4): string {
  return toNumber(value, STOCK_DECIMALS).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Basis points as a percentage string. */
export function formatBps(bps: bigint | number, decimals = 2): string {
  return (Number(bps) / 100).toFixed(decimals);
}

/** Parse a decimal string into USDG base units. */
export function parseUsdg(input: string): bigint {
  return parseUnitsSafe(input, USDG_DECIMALS);
}

/** Parse a decimal string into stock token base units. */
export function parseStock(input: string): bigint {
  return parseUnitsSafe(input, STOCK_DECIMALS);
}

/** Tolerant decimal parser. Empty and malformed input becomes zero, never NaN. */
export function parseUnitsSafe(input: string, decimals: number): bigint {
  const trimmed = input.trim();
  if (!trimmed || !/^\d*\.?\d*$/.test(trimmed)) return 0n;
  const [whole = "0", fraction = ""] = trimmed.split(".");
  const padded = (fraction + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

/** "Aug 25" style. Short, scannable, no year unless it differs. */
export function formatDate(timestamp: number): string {
  const d = new Date(timestamp * 1000);
  const now = new Date();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

/** "21 days" or "4 hours" or "12 minutes". Never a bare number. */
export function formatDuration(seconds: number): string {
  const abs = Math.abs(seconds);
  if (abs >= 86_400) return `${Math.round(abs / 86_400)} days`;
  if (abs >= 3_600) return `${Math.round(abs / 3_600)} hours`;
  if (abs >= 60) return `${Math.round(abs / 60)} minutes`;
  return `${Math.round(abs)} seconds`;
}

/** 0x1234...abcd */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Annualised LP yield from lifetime fees over current assets and elapsed time.
 * Honest about what it is: a backward looking rate, not a promise.
 */
export function estimateApyBps(totalFeesAccrued: bigint, totalAssets: bigint, secondsLive: number): number {
  if (totalAssets === 0n || secondsLive <= 0) return 0;
  const feeRatio = Number(totalFeesAccrued) / Number(totalAssets);
  const yearsLive = secondsLive / 31_536_000;
  if (yearsLive <= 0) return 0;
  return Math.round(feeRatio * (1 / yearsLive) * 10_000);
}
