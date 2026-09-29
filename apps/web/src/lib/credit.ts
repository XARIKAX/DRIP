/**
 * Credit arithmetic the UI has to agree with the contract about.
 *
 * Anything here is a mirror of a rule LendingPool enforces. When the two disagree the
 * app either offers a transaction that reverts — which reaches the user as a hex
 * selector in a wallet popup and reads as the app being broken — or refuses one that
 * would have worked. Both are worse than the check not existing, so this lives apart
 * from the page and has tests.
 */

/**
 * How much collateral value may leave before a loan goes under, in dollars.
 *
 * The inequality LendingPool.requireWithdrawAllowed enforces, rearranged:
 *
 *   debt <= (collateral - leaving) x maxLtv
 *   leaving <= collateral - debt / maxLtv
 *
 * Infinity when nothing is borrowed. That is not a convenience: the contract returns
 * early on a zero debt and never reads the oracle at all, so an unpriced token really
 * can be withdrawn freely when there is no loan.
 *
 * The haircut is not superstition. The contract judges on a debt it read WITHOUT
 * accruing first, and interest keeps accruing between the page loading and the wallet
 * signing. Without it, pressing Max on a loan near its limit builds a transaction that
 * was valid when the number was computed and is not by the time it is mined.
 */
export function freeCollateralUsd(collateralUsd: number, debtUsd: number, maxLtvPct: number): number {
  if (!(debtUsd > 0)) return Infinity;
  if (!(maxLtvPct > 0)) return 0;
  const free = collateralUsd - debtUsd / (maxLtvPct / 100);
  return free > 0 ? free * 0.995 : 0;
}

/**
 * The most of one holding that can be withdrawn, in shares.
 *
 * `priceUsd` is null when the oracle will not price the token. With a loan open that
 * is not a missing number to work around — the contract reads that same price to judge
 * the withdrawal, so it reverts — hence zero rather than a guess.
 */
export function maxWithdrawableShares(
  amount: number,
  priceUsd: number | null,
  freeUsd: number,
  borrowing: boolean
): number {
  if (!(amount > 0)) return 0;
  if (!borrowing) return amount;
  if (priceUsd === null || !(priceUsd > 0)) return 0;
  if (freeUsd === Infinity) return amount;
  return Math.min(amount, freeUsd / priceUsd);
}
