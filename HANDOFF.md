# HANDOFF — Drip Markets production contracts

Product name **Drip Markets**; ticker **$DRIP** (backronym: Dividend Reinvestment
Plan). Solidity contract names, roles and events keep their existing identifiers —
the brand lives in the UI and docs, not in the ABI.

For the Solidity developer taking this to mainnet. Everything in `contracts/` compiles,
passes 74 tests including invariants, and runs the full product loop on a local chain.
Your job is not to build it. Your job is to harden it, replace the testnet stand ins,
and deploy it without changing a single interface the frontend depends on.

The frontend, SDK and MCP server read state exclusively through the interfaces in
`contracts/src/interfaces/` and the events listed below. Keep those stable and nothing
above the contracts needs to be touched.

---

## 1. Architecture

```
                                 declare / void
                    ┌──────────────────────────────────────┐
                    │                                      │
              ┌─────┴─────┐                         ┌──────▼──────────┐
   ORACLE ───►│ Dividend  │◄──── settle (SETTLER) ──│    DripCore     │◄─── deposit/withdraw/
              │ Registry  │                         │  custody +      │     setMode (users)
              └───────────┘                         │  eligibility +  │
                                                    │  routing        │◄─── settleDividend
                                                    └──┬───────┬──────┘     (KEEPER pays USDG)
                              bookAdvance / release    │       │
                              repay / loss (CORE_ROLE) │       │ startStream / cancel (CORE_ROLE)
                    ┌──────────────────────────────────▼─┐   ┌─▼──────────────┐
        LPs ───────►│          AdvanceVault              │◄──│  StreamEngine  │◄─── claim (users)
   (ERC-4626)       │  USDG · fronts dividends · earns   │   │  lazy per      │
                    │  the fee · 80% utilisation cap     │   │  second math   │
                    └────────────────────────────────────┘   └───────┬────────┘
                                                                     │ reinvest (CORE_ROLE)
                                                             ┌───────▼────────┐
                                                             │   Reinvestor   │── swap via ──► ISwapAdapter
                                                             │  slippage guard│               (mock now,
                                                             │  credits back  │                Uniswap later)
                                                             └────────────────┘
```

Money flow for one dividend, holder in REINVEST mode:

1. Oracle declares `(stockToken, amountPerToken, exDate, payDate)` in **DividendRegistry**.
2. At `exDate`, anyone calls `DripCore.activate(dividendId, user)`. Core computes the
   entitlement from its own checkpoints, books the gross in **AdvanceVault** (fee is
   recognised here), opens a stream in **StreamEngine** for the net.
3. The holder claims whenever they like. StreamEngine pulls cash from the vault and, in
   REINVEST mode, sends it to **Reinvestor**, which swaps to stock and credits it back
   into the holder's DripCore position. The loop closes.
4. At `payDate` the issuer's settlement leg calls `DripCore.settleDividend`, which pulls
   the full eligible USDG, repays the vault's receivable, and parks the remainder for
   holders who never activated (`claimSettled`, no fee).
5. If the issuer cancels instead, the oracle voids the dividend and a keeper runs
   `clawback` per activated holder: cancel the undrawn stream, seize deposited stock
   worth the cash already paid, write off the receivable.

## 2. The one design decision that shapes everything

**Only tokens deposited in DripCore before the ex date are eligible.**

The protocol never snapshots external wallets. Eligibility is proved from DripCore's own
checkpoint history (OpenZeppelin `Checkpoints.Trace208`, keyed by timestamp), written on
every deposit, withdrawal, reinvest credit, and clawback seizure.

Why: the protocol then works with any plain ERC-20 stock token, requires no changes to a
token we do not control, no ERC20Snapshot, no merkle drops from an offchain indexer, and
`balanceOfAt(user, token, exDate)` is a provable onchain answer.
Cost: holders opt in by depositing. Documented in the UI as part of the product.

Do not "improve" this into wallet snapshotting without redesigning the whole protocol.

## 3. Contract by contract

| Contract | Purpose | Production changes needed |
|---|---|---|
| `DividendRegistry` | Calendar and lifecycle (DECLARED → SETTLED / VOIDED) | Feed `ORACLE_ROLE` from a real corporate action source. Consider a two step declare + finalise with a dispute window. |
| `DripCore` | Custody, checkpoints, entitlements, routing, settlement, clawback | Harden clawback (below). Decide who runs `KEEPER_ROLE` for `settleDividend` — this is where real issuer cash enters. |
| `AdvanceVault` | ERC-4626 USDG vault. Books advances, earns the fee, caps utilisation | Point at canonical USDG. Review the fee/cap parameters. Consider per token concentration limits (below). |
| `StreamEngine` | Lazy per second streams over the ex→pay window | None structural. Review `KEEPER_ROLE` holders for `claimFor`/`claimBatch`. |
| `Reinvestor` | Claims → swap → credit back. Per user slippage guard | Swap `MockSwapAdapter` for `UniswapV3SwapAdapter` + a real `IPriceOracle`. |
| `mocks/MockStockToken` | TESTNET ONLY faucet ERC-20, 18dp | Delete. Real Robinhood stock tokens replace it. Protocol only calls `transfer/transferFrom/balanceOf/decimals`. |
| `mocks/MockUSDG` | TESTNET ONLY faucet ERC-20, 6dp | Delete. Canonical USDG replaces it. |
| `mocks/MockSwapAdapter` | Fixed price venue with simulated slippage | Delete. |
| `mocks/MockPriceOracle` | Admin set prices | Delete. Real feed behind `IPriceOracle`. |
| `adapters/UniswapV3SwapAdapter` | Production swap seam, already written | Review and deploy. Not used on testnet. Read its header comment: the quote comes from the oracle, not the pool, on purpose. |

### Vault accounting identity

Everything in `AdvanceVault` reduces to:

```
totalAssets = cash + receivables − obligations
```

- `bookAdvance(gross)`: receivables += gross, obligations += gross − fee.
  Assets rise by exactly the fee at the moment risk is taken.
- `releaseAdvance`: cash and obligations fall together. Assets neutral.
- `repayAdvance`: cash rises, receivables fall. Assets neutral.
- `recordLoss`: receivables fall alone. Assets fall. LPs eat it.

Two admission checks on every `bookAdvance`:
1. **Cash floor**: `cash ≥ obligations` after booking. Every promised holder is payable
   today, so a mid stream claim can never fail for lack of funds.
2. **Utilisation cap**: `receivables ≤ maxUtilizationBps` of assets after booking
   (default 80%, admin capped at 95%).

Plus a virtual share offset (`_decimalsOffset = 3`) on top of OZ's ERC-4626, which kills
first depositor share inflation.

## 4. Roles

| Role | Where | Testnet holder | Production holder |
|---|---|---|---|
| `DEFAULT_ADMIN_ROLE` | everywhere | deploy key | multisig + timelock |
| `ORACLE_ROLE` | DividendRegistry | deploy key | dividend oracle / keeper reading issuer data |
| `SETTLER_ROLE` | DividendRegistry | DripCore (contract) | DripCore (unchanged) |
| `KEEPER_ROLE` | DripCore | deploy key | settlement pipe + ops bot (runs `settleDividend`, `clawback`) |
| `KEEPER_ROLE` | StreamEngine | deploy key | batch claim bot (can only push money to holders) |
| `CORE_ROLE` | AdvanceVault | DripCore, StreamEngine | unchanged (contracts only) |
| `CORE_ROLE` | StreamEngine | DripCore | unchanged |
| `CORE_ROLE` | Reinvestor | StreamEngine, DripCore | unchanged |
| `REINVESTOR_ROLE` | DripCore | Reinvestor | unchanged |

Rule the wiring enforces: **only protocol contracts move protocol money.** Human held
roles either feed data (oracle), pay money in (settlement keeper), or push money to its
rightful owner (claim keeper). No role can redirect a holder's funds to a third party.

`script/Deploy.s.sol` `_wire()` is the canonical wiring. `test/DripTestBase.sol` mirrors
it; keep them in step.

## 5. Trust assumptions, ranked

1. **The oracle is the big one.** A dishonest `ORACLE_ROLE` can declare a dividend that
   will never settle and drain up to the utilisation cap as "advances", or void a real
   dividend and trigger clawbacks. Mitigations available before launch: multisig oracle,
   a delay between declare and ex date (already structurally present), a bond, and the
   cap itself, which bounds the worst case at 80% of vault assets.
2. **Issuer settlement.** The vault's receivable is only as good as the issuer's payment
   at `payDate`. On Robinhood Chain the issuer leg is Robinhood itself; the clawback path
   exists for the residual.
3. **Admin keys.** Pause, fee (≤5%), cap (≤95%), swap adapter pointer, collateral
   liquidation. All should sit behind a timelock in production.
4. **Price source for reinvest and clawback.** See the header of
   `UniswapV3SwapAdapter`: the slippage reference must come from a feed the trade cannot
   move inside one block. Never quote the pool you are about to trade against.

## 6. Clawback: testnet simplification vs production hardening

Testnet (`DripCore.clawback`, implemented):
- cancel undrawn stream, cancel that obligation
- seize deposited stock worth the cash actually paid out, priced by the swap adapter
- hand seized stock to the vault, write off the receivable, mark the entitlement

Production hardening required:
- [ ] Price the seizure via `IPriceOracle`, not the swap venue.
- [ ] Handle the holder who withdrew before the void landed: the current version seizes
      up to their remaining balance and eats the rest as vault loss. Consider a short
      withdrawal delay on positions with an active advance, or an insurance sliver of
      the fee, before reaching for anything heavier.
- [ ] Automate or timelock `liquidateCollateral` (currently admin manual, deliberately —
      an automated DEX route on the recovery path is a worse thing to trust).
- [ ] Void inside the stream window mid claim: the sequence is safe (cancel before
      seize) but deserves a dedicated fuzz campaign.

## 7. Testnet → production delta checklist

- [ ] Replace `MockUSDG` with canonical USDG address (6 decimals — the code assumes it).
- [ ] Replace `MockStockToken`s with real stock token addresses (18 decimals assumed;
      verify, and if any differ, audit `ONE_STOCK` math in DripCore and the adapters).
- [ ] Deploy `UniswapV3SwapAdapter` against the chain's Uniswap router; set fee tiers.
- [ ] Deploy a real `IPriceOracle`; wire it into the adapter and (per §6) clawback.
- [ ] Feed `ORACLE_ROLE` from the real dividend source.
- [ ] Decide the settlement pipe for `DripCore.settleDividend` (who holds KEEPER_ROLE
      and where the USDG comes from).
- [ ] Move every admin role to multisig + timelock.
- [ ] Delete `contracts/src/mocks/` from the production deployment.
- [ ] Faucet functions exist only on mocks; nothing to strip elsewhere.
- [ ] Re run the deploy script with real addresses passed in (see `_deployProtocol` —
      the mock lines are the only testnet specific code in it).

## 8. Mainnet listing universe — Robinhood Chain (4663)

The production universe is maintained in `contracts/listings/4663.json`: 16 stock
tokens with their Chainlink USD feeds and swap routes, plus the routing infra
(WETH, USDG, SwapRouter02, QuoterV2, the ETH/USD feed). The SDK exports the same
table typed as `listings`. SPCX is present but `enabled: false` — never traded,
private-company feed, review before listing.

Production contracts already written against it:

- `src/adapters/ChainlinkPriceOracle.sol` — one 8-decimal USD feed per token,
  scaled to the 6-decimal USDG quote, 1 hour heartbeat staleness guard, fails
  closed on stale, zero, negative, or incomplete rounds. This is the reference
  price for slippage bounds and clawback sizing.
- `src/adapters/UniswapV3SwapAdapter.sol` — SwapRouter02 semantics. NOTE: the
  SwapRouter02 `ExactInputSingleParams` struct has NO deadline field; encoding
  the original SwapRouter struct against it produces undecodable calldata. The
  adapter swaps the USDG → token leg only (the protocol already holds the USDG
  mid-hop asset; the chain has no direct ETH/stock pools).
- `script/VerifyUniverse.s.sol` — run `forge script script/VerifyUniverse.s.sol
  --rpc-url robinhood_mainnet` before every wiring change. It hard-fails unless,
  for every enabled token: symbol and 18 decimals match onchain, the feed is
  8-decimal and fresh inside the heartbeat, both the full WETH→USDG→token route
  and the USDG leg quote through QuoterV2, and the quoted output sits within
  bounds of the Chainlink price.

The listing rules, non-negotiable (they are also embedded in the JSON):

1. No feed, no listing. BE and USAR exist with no feed — never list them.
2. Verify onchain before wiring: token `symbol()`/`decimals()`, feed
   `description()`, feed liveness. Hard-fail on any mismatch.
3. Quote every route through QuoterV2 before enabling it; re-check fee tier
   3000 per pool.
4. Path encoding is `abi.encodePacked(WETH, uint24(3000), USDG, uint24(3000),
   token)`; minOut bounds the FINAL token against the Chainlink price, never
   the mid leg.
5. All feeds are 8-decimal USD via `latestRoundData()`; guard staleness with
   the 1 hour heartbeat and refuse to settle on a stale read. Fail closed to
   refund.
6. Stock tokens are Robinhood-issued debt trackers: run a live small
   receive/hold/transfer test from a contract before real bankroll.

## 8b. Upgradeability — open decision, flagged

v1 as written is **immutable, no proxies**. Migration path if something must change:
deploy v2, pause v1 user entry points, holders withdraw and redeposit. Positions are
plain balances so migration is mechanical.

If you prefer UUPS: every contract is AccessControl based and stateless enough to
convert, but you take on storage layout discipline and upgrade key risk. Our
recommendation is immutable for v1 with the migration path documented to users. Your
call — flagging it as the brief requires.

## 9. Invariants that must survive your changes

Tested in `contracts/test/invariant/`:

1. **Vault solvency**: `cash ≥ obligations` at all times, and utilisation ≤ cap.
2. **Streams never overpay**: `claimed ≤ total` per stream, and totals equal the booked
   net entitlement.
3. **Custody honesty**: `Σ positions == token.balanceOf(DripCore) == totalDeposited`
   per token — reinvest credits are 1:1 backed by held tokens.

Plus `test_HandlerReachesEveryState`, which fails loudly if the invariant handler ever
stops reaching deep states (a green invariant suite that tests nothing is the failure
mode to fear). Keep all of these green; extend the handler when you add paths.

## 10. Event surface the frontend depends on (do not change signatures)

- Registry: `DividendDeclared`, `DividendSettled`, `DividendVoided`, `SupportedTokenAdded`
- DripCore: `Deposited`, `Withdrawn`, `ModeSet`, `EntitlementCreated`,
  `EntitlementActivated`, `SettledDividendFunded`, `SettledEntitlementClaimed`,
  `Reinvested`, `ClawedBack`
- Vault: `AdvancePaid`, `AdvanceReleased`, `AdvanceRepaid`, `FeeAccrued`,
  `LossRecorded`, `CollateralClawedBack`
- StreamEngine: `StreamStarted`, `StreamClaimed`, `StreamClosed`
- Reinvestor: `Reinvested`, `SlippageSet`, `SwapAdapterSet`

Same for every view function in `contracts/src/interfaces/`. The SDK
(`packages/sdk/src/generated/`) is regenerated from ABIs by `scripts/sync-abis.mjs`;
additive changes are fine, breaking changes are not.

## 11. Audit checklist

- [ ] Reentrancy: guards sit on every external token moving entry point. The one
      deliberate exception is documented inline: `DripCore.creditReinvest` (reached
      inside `claimSettled`'s guard; safety argument in the comment — verify it).
- [ ] ERC-4626 rounding: OZ defaults + offset 3. Check `maxWithdraw`/`maxRedeem`
      clamping against `freeCash` for griefing edges.
- [ ] Checkpoint casts: balances go through `SafeCast.toUint208`, timestamps to uint48.
- [ ] Fee-on-transfer / rebasing stock tokens: NOT supported. DripCore credits the
      requested amount, not the received amount. If any real stock token misbehaves
      this way, switch to balance delta accounting in `deposit` and `creditReinvest`.
- [ ] Decimals: USDG hardcoded 6, stock hardcoded 18 (`ONE_STOCK`). Verify per real token.
- [ ] `activateBatch` / `claimBatch` griefing: both skip instead of revert; bounded by
      calldata size. Confirm gas bombs are not possible via huge arrays.
- [ ] Pause semantics: pausing the vault blocks deposits AND withdrawals (LP exit too) —
      confirm that is the intended emergency posture.
- [ ] Oracle timing: `declareDividend` requires `exDate ≥ now`; a same second declare +
      activate is possible for an oracle — decide if a minimum notice period is wanted.
- [ ] `MAX_SETTLEMENT_WINDOW` (90 days) bounds vault duration risk; revisit per market.

## 12. Repo map

```
contracts/src/            the six protocol contracts + interfaces + mocks + adapters
contracts/test/           unit + integration suites, one per contract
contracts/test/invariant/ handler driven invariant suite
contracts/script/         Deploy.s.sol (writes deployments/<chainid>.json), Seed.s.sol
scripts/deploy-local.sh   anvil → deploy → seed → fast forward → sync ABIs
scripts/sync-abis.mjs     ABIs + address books → packages/sdk/src/generated
packages/sdk/             viem SDK: typed reads (DripReader), unsigned write builders
packages/mcp/             MCP server: 4 read tools, 3 write tools, no keys, stdio
apps/web/                 Next.js app
```

Run everything: see README. Tests: `forge test --root contracts`.
