# HANDOFF — Osinko production contracts

Product name **Osinko** (Finnish for *dividend* — the Aave of dividends); ticker
**$OSINKO**. The product was previously branded Drip Markets and, before that,
$DRIP. Solidity contract names, roles, events and package identifiers keep their
existing Drip-era names — the brand lives in the UI and docs, not in the ABI, and
renaming deployed-artifact identifiers buys nothing but churn.

The protocol has three sides sharing one balance sheet:
- **Income** (built, tested): advances at the ex date, per-second streams,
  auto-reinvestment. Contracts in this repo, 96 tests green.
- **Credit** (demo live, contracts to build): USDG borrowing against deposited
  stock collateral with dividend-serviced interest. Specified in section 13 below;
  currently implemented only in the web app's demo data layer.
- **Trade** (built, tested): split a stock token into a Principal Token and a
  Yield Token, so the drip itself becomes a liquid position. `SplitVault`,
  specified in section 14 below — the only module that wraps the share, and it
  is opt in.

For the Solidity developer taking this to mainnet. Everything in `contracts/` compiles,
passes 96 tests including invariants, and runs the full product loop on a local chain.
Your job is not to build the income and trade sides from scratch — they are done. Your
job is to harden all of it, build the credit side per section 13, replace the testnet
stand ins, and deploy without changing a single interface the frontend depends on.

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
| `SplitVault` | The one module that wraps the share: PT/YT issuance, harvest, claim | See §14. One active series per stock token by design (§14) — production wanting concurrent maturities needs a per-series sub-account. |
| `PrincipalToken` / `YieldToken` | Minted per series by `SplitVault`, mint/burn gated to it | None structural. `YieldToken` checkpoints every transfer the same way `DripCore` checkpoints deposits — read that before touching either. |

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

## 13. Credit side — LendingPool specification (to build)

The web app already ships the Borrow experience in demo mode
(`apps/web/src/app/app/borrow`, backed by `mock.ts`). The onchain market that
replaces it should follow Aave's economics with one Osinko twist: dividend income
on the collateral services the debt.

Shape:

- **Collateral**: stock tokens already custodied in DripCore. Pledged collateral is
  locked against withdrawal while it backs debt (this also closes the clawback gap
  in section 6 for borrowers).
- **Borrow asset**: USDG from the same AdvanceVault balance sheet. LP yield becomes
  advance fees plus borrow interest — the vault's `totalAssets` identity gains a
  `loansOutstanding` receivable term, mirroring `receivables`.
- **Parameters** (initial, conservative): max LTV 40%, liquidation threshold 65%,
  liquidation bonus 5%, borrow rate from a kinked utilisation curve (base 2%,
  slope1 to 8% at 80% utilisation, slope2 steep past the kink).
- **Pricing**: ChainlinkPriceOracle (section 8), staleness fail-closed. A stale feed
  freezes new borrows against that collateral and blocks liquidations that depend
  on it — never liquidate on a stale price.
- **Dividend servicing**: when the protocol realises dividend value for a borrower
  (advance, stream claim, settlement), route it debt-first: interest, then
  principal if the holder opts in, then the holder's chosen mode. One hook in
  DripCore's entitlement flow.
- **Liquidation**: repay up to close factor (50%) of debt, seize collateral plus
  bonus, sell through the SwapRouter02 adapter with oracle-bounded minOut. Same
  no-pool-as-oracle rule as everything else.
- **Invariants to test**: debt of any account ≤ collateral value × liq threshold at
  action time; vault cash + receivables + loans ≥ obligations; dividend servicing
  never reduces principal below zero; a stale oracle can never mint debt.

## 14. Trade side — SplitVault (already built, here is what to review)

Unlike LendingPool above, this one is built, tested (13 tests in
`SplitVault.t.sol`) and wired into `Deploy.s.sol`. It is the one module in the
protocol that wraps the share — Early, Stream, Reinvest and Borrow never mint a
second token against a deposit; Split does, and only because a holder opted in.

The mechanism, in one line: `SplitVault` deposits into `DripCore` under its own
address, in `CASH_EARLY` mode, and becomes an ordinary `DripCore` holder like
anyone else. A **Principal Token** and a **Yield Token** are minted 1:1 against
what it deposits. PT redeems 1:1 for the stock at maturity. YT is a claim on
every dividend the series harvests before then, checkpointed the same way
`DripCore` checkpoints deposit eligibility (`YieldToken` mirrors `DripCore`'s
`Checkpoints.Trace208` pattern exactly, so a dividend harvested after a YT
transfer still pays whoever held it at that dividend's own ex date, not whoever
holds it now).

**The load-bearing simplification, stated as loudly as `SplitVault.sol` itself
states it**: one active series per stock token. A new series cannot open until
the prior one's PT supply is fully redeemed to zero. That is what keeps
`dripCore.balanceOf(splitVault, stockToken) == activeSeries.PT.totalSupply()`
true at every moment, and it is the reason nothing below needs a second layer of
cross-series proration. Production wanting concurrent maturities on the same
stock (the way Pendle runs several expiries on one asset at once) needs a
per-series sub-account — a minimal proxy that itself deposits into `DripCore`
under its own address — so each series' custody, and each series' harvested
dividend pool, stays cleanly separated from every other series on the same stock.

What else production should look at:

- **Split fee**: 10 bps default, 100 bps ceiling (`MAX_SPLIT_FEE_BPS`), same
  shape as `AdvanceVault`'s fee ceiling. Fee stock is held in the vault rather
  than deposited, specifically so `PT.totalSupply()` never has to account for
  stock that never entered `DripCore` — do not change that without re-deriving
  the accounting identity above.
- **Harvest is permissionless**, deliberately, the same as `DripCore.activate`:
  a keeper, a YT holder, or the UI can all trigger it, and the USDG can only ever
  land in `SplitVault` itself.
- **A harvest is a normal CASH_EARLY entitlement** from `DripCore`'s point of
  view, so it is subject to `AdvanceVault`'s cash floor and utilisation cap like
  any other CASH_EARLY holder — a harvest can revert for the same capacity
  reasons a normal advance can. No special-casing was added for SplitVault here
  on purpose: it should face the same risk surface as everyone else.
- **YT decays to zero at maturity**, not before. Splitting after maturity is
  blocked (`AlreadyMatured`) since it would mint a Yield Token with nothing left
  to accrue; merging after maturity is still allowed, since burning PT+YT for
  stock is harmless whenever it happens.
- **No AMM.** There is no secondary market for PT or YT in this repo — the demo
  UI's "implied yield" figure is the same annualised-yield arithmetic used
  everywhere else in the app, not a market price. A real PT/YT market (Pendle's
  own AMM shape, or a simpler constant-sum pool) is the actual "trade the drip"
  half of the pitch and is the highest-leverage thing to build next here.
- **Invariants to test further**: `dripCore.balanceOf(vault, token) ==
  PT.totalSupply()` holds at every block for the active series; sum of all
  `claimYield` payouts for one dividend never exceeds that dividend's harvested
  pool; a YT balance transferred after a dividend's ex date can never change
  what that dividend pays out (tested once in `SplitVault.t.sol`; worth an
  invariant handler alongside the existing DripCore one).

## 12. Repo map

```
contracts/src/            ten protocol contracts + interfaces + mocks + adapters
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
