import { strict as assert } from "node:assert";
import { test } from "node:test";
import { freeCollateralUsd, maxWithdrawableShares } from "./credit.ts";

test("no loan means no constraint at all", () => {
  assert.equal(freeCollateralUsd(1000, 0, 70), Infinity);
  // Even a token nothing will price: the contract returns early before the oracle read.
  assert.equal(maxWithdrawableShares(5, null, Infinity, false), 5);
});

test("a loan frees only what it is not leaning on", () => {
  // $1000 collateral, $350 owed, 70% LTV. The loan needs $500 of collateral behind it,
  // so $500 is free, less the accrual haircut.
  const free = freeCollateralUsd(1000, 350, 70);
  assert.ok(Math.abs(free - 497.5) < 0.01, `got ${free}`);
});

test("a loan at the limit frees nothing, and never a negative", () => {
  assert.equal(freeCollateralUsd(1000, 700, 70), 0);
  // Underwater already — a liquidation case, not a withdrawal one.
  assert.equal(freeCollateralUsd(1000, 900, 70), 0);
});

test("the haircut leaves a margin the contract would have allowed", () => {
  // Deliberate: the contract judges on a pre-accrual debt, so the honest maximum drifts
  // downward between load and mine. Erring low costs dust; erring high costs the tx.
  const free = freeCollateralUsd(1000, 350, 70);
  assert.ok(free < 500, "should sit under the exact figure");
  assert.ok(free > 495, "but not so far under that it is useless");
});

test("shares are capped by the scarcer of balance and free collateral", () => {
  // 10 shares at $100 = $1000 held, but only $497.50 of it may leave.
  assert.ok(Math.abs(maxWithdrawableShares(10, 100, 497.5, true) - 4.975) < 1e-9);
  // Free collateral exceeds the whole position: the balance binds instead.
  assert.equal(maxWithdrawableShares(10, 100, 5000, true), 10);
});

test("an unpriced holding cannot leave while a loan is open", () => {
  // The contract reads the same price to judge it, so it reverts. Zero, not a guess.
  assert.equal(maxWithdrawableShares(10, null, 5000, true), 0);
  assert.equal(maxWithdrawableShares(10, 0, 5000, true), 0);
});

test("nothing on deposit yields nothing withdrawable", () => {
  assert.equal(maxWithdrawableShares(0, 100, 5000, true), 0);
});
