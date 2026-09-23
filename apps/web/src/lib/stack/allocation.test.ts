/**
 * The allocation invariants.
 *
 * Run with `pnpm test` from the repo root. Node 22 strips the types itself, so there is
 * no runner, no config and no dependency to keep current — the tests are the same
 * TypeScript the app imports.
 *
 * What is worth testing here is not "does addAsset return an array". It is the handful
 * of claims the UI makes out loud and cannot walk back: the total is always exactly
 * 100%, a weight you set is the weight you get, the same input always produces the same
 * output, and nothing a user can type corrupts the state.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  addAsset,
  clampWeight,
  formatPct,
  fromPctInput,
  isValid,
  MAX_ASSETS,
  MIN_BPS,
  normalise,
  removeAsset,
  setWeight,
  TOTAL_BPS,
  toPct,
  type Allocation,
} from "./allocation.ts";

/** Build a Stack from percentages, for readable test setup. */
function stack(...pcts: number[]): Allocation[] {
  return pcts.map((pct, i) => ({
    assetId: `A${i}`,
    kind: "stock" as const,
    weightBps: pct * 100,
    slot: i,
  }));
}

const weights = (a: readonly Allocation[]) => a.map((x) => x.weightBps);
const total = (a: readonly Allocation[]) => a.reduce((s, x) => s + x.weightBps, 0);

/* ------------------------------------------------------------------ */
/* The three worked examples from the brief                            */
/* ------------------------------------------------------------------ */

test("setting 50/30/20 to 60 gives 60/24/16", () => {
  const out = setWeight(stack(50, 30, 20), "A0", 6000);
  assert.deepEqual(weights(out), [6000, 2400, 1600]);
});

test("removing the third of 50/30/20 gives 62.5/37.5", () => {
  const out = removeAsset(stack(50, 30, 20), "A2");
  assert.deepEqual(weights(out), [6250, 3750]);
});

test("adding a fourth to 50/30/20 gives 37.5/22.5/15/25", () => {
  const out = addAsset(stack(50, 30, 20), "NEW");
  assert.deepEqual(weights(out), [3750, 2250, 1500, 2500]);
});

/* ------------------------------------------------------------------ */
/* The invariant                                                       */
/* ------------------------------------------------------------------ */

test("the total is exactly 10000 after every operation", () => {
  let s: Allocation[] = [];
  for (const id of ["NVDA", "TSLA", "MSFT", "AAPL", "GOOGL"]) {
    s = addAsset(s, id);
    assert.equal(total(s), TOTAL_BPS, `after adding ${id}`);
    assert.ok(isValid(s));
  }
  for (const id of ["MSFT", "NVDA", "GOOGL"]) {
    s = removeAsset(s, id);
    assert.equal(total(s), TOTAL_BPS, `after removing ${id}`);
    assert.ok(isValid(s));
  }
});

test("a long random sequence never breaks the invariant", () => {
  // A fixed LCG, so a failure is reproducible rather than a story about last Tuesday.
  let seed = 20260922;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

  const ids = ["NVDA", "TSLA", "MSFT", "AAPL", "GOOGL", "AMZN", "META"];
  let s: Allocation[] = [];

  for (let i = 0; i < 4000; i++) {
    const roll = rand();
    const id = ids[Math.floor(rand() * ids.length)]!;
    if (roll < 0.4) s = addAsset(s, id);
    else if (roll < 0.6) s = removeAsset(s, id);
    else if (s.length > 0) {
      const target = s[Math.floor(rand() * s.length)]!;
      s = setWeight(s, target.assetId, Math.floor(rand() * (TOTAL_BPS + 400)) - 200);
    }
    assert.ok(isValid(s), `broke at step ${i}: ${JSON.stringify(s)}`);
  }
});

test("rounding residuals are distributed, not dropped", () => {
  // Three equal assets cannot divide 10000 evenly; somebody must get the extra point.
  const s = addAsset(addAsset(addAsset([], "A"), "B"), "C");
  assert.equal(total(s), TOTAL_BPS);
  assert.deepEqual(weights(s).sort((a, b) => a - b), [3333, 3333, 3334]);
});

test("the same input always gives the same output", () => {
  const a = addAsset(stack(33.33, 33.33, 33.34), "NEW");
  const b = addAsset(stack(33.33, 33.33, 33.34), "NEW");
  assert.deepEqual(weights(a), weights(b));
});

/* ------------------------------------------------------------------ */
/* Adding and removing                                                 */
/* ------------------------------------------------------------------ */

test("the first asset takes the whole ring", () => {
  assert.deepEqual(weights(addAsset([], "NVDA")), [TOTAL_BPS]);
});

test("a duplicate is refused without disturbing the weights", () => {
  const before = stack(50, 30, 20);
  const after = addAsset(before, "A1");
  assert.equal(after, before, "should return the very same array");
});

test("the seventh asset is refused", () => {
  let s: Allocation[] = [];
  for (let i = 0; i < MAX_ASSETS; i++) s = addAsset(s, `T${i}`);
  assert.equal(s.length, MAX_ASSETS);
  const after = addAsset(s, "ONE_TOO_MANY");
  assert.equal(after, s);
});

test("adding keeps the existing assets in proportion to each other", () => {
  const out = addAsset(stack(70, 30), "NEW");
  const [a, b] = weights(out);
  assert.ok(Math.abs(a! / b! - 70 / 30) < 0.01, `ratio drifted: ${a}/${b}`);
});

test("removing an asset that is not there changes nothing", () => {
  const before = stack(50, 50);
  assert.equal(removeAsset(before, "NOPE"), before);
});

test("removing the last asset leaves an empty Stack", () => {
  assert.deepEqual(removeAsset(stack(100), "A0"), []);
});

test("removing down to one asset pins it at 100%", () => {
  const out = removeAsset(removeAsset(stack(50, 30, 20), "A0"), "A1");
  assert.deepEqual(weights(out), [TOTAL_BPS]);
});

/* ------------------------------------------------------------------ */
/* Colour slots                                                        */
/* ------------------------------------------------------------------ */

test("an asset keeps its colour when a different asset is removed", () => {
  const s = addAsset(addAsset(addAsset([], "NVDA"), "TSLA"), "MSFT");
  const msftBefore = s.find((a) => a.assetId === "MSFT")!.slot;
  const after = removeAsset(s, "NVDA");
  assert.equal(after.find((a) => a.assetId === "MSFT")!.slot, msftBefore);
});

test("a freed slot is reused rather than running past the palette", () => {
  let s: Allocation[] = [];
  for (let i = 0; i < MAX_ASSETS; i++) s = addAsset(s, `T${i}`);
  s = removeAsset(s, "T0");
  s = addAsset(s, "LATE");
  assert.equal(s.find((a) => a.assetId === "LATE")!.slot, 0);
  assert.equal(new Set(s.map((a) => a.slot)).size, s.length, "slots must stay unique");
});

/* ------------------------------------------------------------------ */
/* Setting a weight                                                    */
/* ------------------------------------------------------------------ */

test("the weight you set is the weight you get", () => {
  // Up to the ceiling, which on a Stack of three is 100% minus the other two floors.
  for (const bps of [1, 100, 2537, 5000, 9998]) {
    const out = setWeight(stack(50, 30, 20), "A1", bps);
    assert.equal(out[1]!.weightBps, bps, `asked for ${bps}`);
    assert.equal(total(out), TOTAL_BPS);
  }
});

test("a weight above the ceiling is clamped, leaving everyone else their floor", () => {
  const out = setWeight(stack(50, 30, 20), "A0", 99_999);
  assert.equal(out[0]!.weightBps, TOTAL_BPS - 2 * MIN_BPS);
  assert.equal(total(out), TOTAL_BPS);
  assert.ok(out.every((a) => a.weightBps >= MIN_BPS));
});

test("a weight below the floor is clamped up rather than evicting the asset", () => {
  const out = setWeight(stack(50, 30, 20), "A0", -500);
  assert.equal(out[0]!.weightBps, MIN_BPS);
  assert.equal(out.length, 3);
  assert.equal(total(out), TOTAL_BPS);
});

test("a lone asset cannot be moved off 100%", () => {
  assert.deepEqual(weights(setWeight(stack(100), "A0", 4000)), [TOTAL_BPS]);
});

test("setting a weight on an unknown asset changes nothing", () => {
  const before = stack(60, 40);
  assert.equal(setWeight(before, "GHOST", 5000), before);
});

test("an interrupted drag settles wherever it stopped", () => {
  // What a slider actually produces: a burst of values, the last one winning.
  let s = stack(50, 30, 20);
  for (const bps of [5100, 5300, 5800, 6200, 6100]) s = setWeight(s, "A0", bps);
  assert.equal(s[0]!.weightBps, 6100);
  assert.equal(total(s), TOTAL_BPS);
});

test("a non-finite weight is treated as the floor, not as NaN", () => {
  const out = setWeight(stack(50, 50), "A0", Number.NaN);
  assert.equal(out[0]!.weightBps, MIN_BPS);
  assert.equal(total(out), TOTAL_BPS);
});

test("clampWeight leaves room for the others", () => {
  assert.equal(clampWeight(99_999, 1), TOTAL_BPS);
  assert.equal(clampWeight(99_999, 2), TOTAL_BPS - MIN_BPS);
  assert.equal(clampWeight(99_999, 5), TOTAL_BPS - 4 * MIN_BPS);
  assert.equal(clampWeight(-10, 3), MIN_BPS);
});

/* ------------------------------------------------------------------ */
/* Repairing what came from storage                                    */
/* ------------------------------------------------------------------ */

test("normalise repairs weights that do not sum to 100%", () => {
  const out = normalise([
    { assetId: "NVDA", weightBps: 9000 },
    { assetId: "TSLA", weightBps: 9000 },
  ]);
  assert.equal(total(out), TOTAL_BPS);
  assert.deepEqual(weights(out), [5000, 5000]);
});

test("normalise reproduces a composition exactly", () => {
  // How the example Stack is built, and why it is built this way. Adding three stocks
  // and then calling setWeight three times does NOT land on 50/30/20 — each call
  // rescales the holdings it is not editing, and the ring ends up at 48.7/31.3/20.
  const out = normalise([
    { assetId: "NVDA", weightBps: 5000 },
    { assetId: "TSLA", weightBps: 3000 },
    { assetId: "MSFT", weightBps: 2000 },
  ]);
  assert.deepEqual(weights(out), [5000, 3000, 2000]);
  assert.deepEqual(
    out.map((a) => a.assetId),
    ["NVDA", "TSLA", "MSFT"],
    "order is the ring order and must survive"
  );
});

test("normalise drops duplicates and junk", () => {
  const out = normalise([
    { assetId: "NVDA", weightBps: 5000 },
    { assetId: "nvda", weightBps: 3000 },
    { assetId: "", weightBps: 1000 },
    { weightBps: 1000 },
    { assetId: "TSLA", weightBps: 5000 },
  ]);
  assert.deepEqual(
    out.map((a) => a.assetId),
    ["NVDA", "TSLA"]
  );
  assert.ok(isValid(out));
});

test("normalise caps an over-long list", () => {
  const out = normalise(
    Array.from({ length: 12 }, (_, i) => ({ assetId: `T${i}`, weightBps: 800 }))
  );
  assert.equal(out.length, MAX_ASSETS);
  assert.ok(isValid(out));
});

test("normalise survives garbage weights", () => {
  const out = normalise([
    { assetId: "NVDA", weightBps: Number.NaN },
    { assetId: "TSLA", weightBps: -400 },
    { assetId: "MSFT", weightBps: Number.POSITIVE_INFINITY },
  ]);
  assert.ok(isValid(out), JSON.stringify(out));
  assert.equal(total(out), TOTAL_BPS);
});

test("normalise of nothing is an empty Stack, not a broken one", () => {
  assert.deepEqual(normalise([]), []);
  assert.deepEqual(normalise([{ assetId: "   " }]), []);
});

test("normalise assigns unique slots", () => {
  const out = normalise([
    { assetId: "A", weightBps: 100, slot: 3 },
    { assetId: "B", weightBps: 100, slot: 3 },
    { assetId: "C", weightBps: 100, slot: 3 },
  ]);
  assert.equal(new Set(out.map((a) => a.slot)).size, 3);
});

/* ------------------------------------------------------------------ */
/* What the fields do with typing                                      */
/* ------------------------------------------------------------------ */

test("a half-typed percentage is not yet a number", () => {
  assert.equal(fromPctInput(""), null);
  assert.equal(fromPctInput("."), null);
  assert.equal(fromPctInput("abc"), null);
  assert.equal(fromPctInput("12.3.4"), null);
  assert.equal(fromPctInput("-5"), null);
});

test("a typed percentage becomes basis points", () => {
  assert.equal(fromPctInput("24"), 2400);
  assert.equal(fromPctInput("24.5"), 2450);
  assert.equal(fromPctInput("0.01"), 1);
  assert.equal(fromPctInput(" 33.33 "), 3333);
  assert.equal(fromPctInput("50%"), 5000);
  assert.equal(fromPctInput("12."), 1200);
});

test("percentages format without trailing noise", () => {
  assert.equal(formatPct(2400), "24");
  assert.equal(formatPct(2450), "24.5");
  assert.equal(formatPct(3333), "33.33");
  assert.equal(formatPct(TOTAL_BPS), "100");
  assert.equal(toPct(2400), 24);
});

test("isValid rejects what the UI must never render", () => {
  assert.ok(isValid([]));
  assert.ok(!isValid(stack(50, 30)), "must sum to 100%");
  assert.ok(!isValid([...stack(50), ...stack(50)]), "duplicate ids");
  assert.ok(
    !isValid([{ assetId: "A", kind: "stock", weightBps: 10_000.5, slot: 0 }]),
    "non-integer"
  );
});

/* ------------------------------------------------------------------ */
/* Imported tokens                                                     */
/* ------------------------------------------------------------------ */

test("an address keeps its case-folded identity, a ticker keeps its own", () => {
  const out = normalise([
    { assetId: "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01", kind: "token", weightBps: 5000 },
    { assetId: "nvda", weightBps: 5000 },
  ]);
  assert.deepEqual(
    out.map((a) => a.assetId),
    ["0xabcdef0123456789abcdef0123456789abcdef01", "NVDA"]
  );
  assert.deepEqual(
    out.map((a) => a.kind),
    ["token", "stock"]
  );
});

test("the same token pasted twice in different case is one holding", () => {
  const addr = "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01";
  const out = normalise([
    { assetId: addr, kind: "token", weightBps: 5000 },
    { assetId: addr.toLowerCase(), kind: "token", weightBps: 5000 },
  ]);
  assert.equal(out.length, 1, "a duplicate address must collapse");
  assert.ok(isValid(out));
});

test("an address with no kind is still recognised as a token", () => {
  const out = normalise([{ assetId: "0x39dbed3a2bd333467115de45665cc57f813c4571", weightBps: 10_000 }]);
  assert.equal(out[0]!.kind, "token");
});

test("stocks and tokens count slots separately, so neither runs out early", () => {
  let s: Allocation[] = [];
  for (const id of ["NVDA", "TSLA", "MSFT"]) s = addAsset(s, id, "stock");
  for (const id of ["0xaaa", "0xbbb"]) s = addAsset(s, id, "token");

  const stocks = s.filter((a) => a.kind === "stock").map((a) => a.slot);
  const tokens = s.filter((a) => a.kind === "token").map((a) => a.slot);
  assert.deepEqual(stocks, [0, 1, 2], "stocks take the stock ramp in order");
  assert.deepEqual(tokens, [0, 1], "tokens start their own ramp at zero");
  assert.ok(isValid(s));
});

test("a Stack holds six", () => {
  let s: Allocation[] = [];
  for (let i = 0; i < MAX_ASSETS; i++) s = addAsset(s, `T${i}`);
  assert.equal(s.length, 6);
  assert.equal(total(s), TOTAL_BPS);
  assert.equal(addAsset(s, "SEVENTH"), s);
});

test("a six-asset Stack still sums exactly", () => {
  let s: Allocation[] = [];
  for (const id of ["NVDA", "TSLA", "MSFT", "AAPL"]) s = addAsset(s, id, "stock");
  for (const id of ["0xaaa", "0xbbb"]) s = addAsset(s, id, "token");
  assert.equal(total(s), TOTAL_BPS);
  s = setWeight(s, "0xaaa", 4000);
  assert.equal(total(s), TOTAL_BPS);
  assert.equal(s.find((a) => a.assetId === "0xaaa")!.weightBps, 4000);
});
