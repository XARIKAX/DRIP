# Osinko keeper

Four jobs, on a timer, against a deployed Osinko protocol.

| job | what it does | costs |
| --- | --- | --- |
| **activate** | Pays holders the moment their entitlement exists, instead of whenever someone remembers to. `activate` is permissionless, so this needs no role. | gas |
| **settle** | On the pay date, pays the protocol what the issuer paid: retires the vault's receivable and makes non-advanced holders claimable. | gas **and the full entitlement in USDG** |
| **rewards** | Hands out whatever USDG sits unallocated in the reward vault, split across depositors by the value of what they hold. Needs `DISTRIBUTOR_ROLE` on the reward vault. | gas; the pot is money Osinko already put in |
| **freeze** | Stops the yield clock on split series that have matured, so a dividend landing afterwards cannot accrue to YT out of PT's principal. Permissionless, needs no role. | gas, once per series |

Settlement is off unless `SETTLE_ENABLED=true`, and rewards are off unless
`REWARDS_ENABLED=true`. A service that can move the float on its own should say so out
loud before it is allowed to.

## How rewards are worked out

There is no accrual and no clock. Funding is the trigger and the pot is the amount:
whatever USDG sits unallocated in the vault goes straight out on the next cycle,
split across everyone holding stock in the platform.

Each holder's weight is `deposit value x the listing's rewardRatePct`. Two things
about that:

**Why value, not shares.** A dollar is a dollar. Splitting by share count would pay
someone holding a cheap ticker the same as someone holding an expensive one.

**Why the rate is in there at all.** Weighting by value alone makes every dollar on
deposit earn exactly the same, whatever it was deposited in — so the eleven different
percentages the app shows would all be the same number in reality, and the per stock
figures would be decoration. Multiplying by the rate is what makes them true: after any
distribution, what a dollar of MSFT earned over what a dollar of NVDA earned is
precisely the ratio of their posted rates. If no token carries a rate the weighting
falls back to plain value, which is the same split with every rate equal.

**A quiet price feed skips its token for that cycle** rather than valuing it at zero,
which would cut its holders out of the split while paying everyone else in full. The
pot is not spent, so the next cycle divides the same money once the feed answers.

The pot is cleared exactly, by the largest remainder method. Plain division floors
every holder and leaves a few base units behind, which would sit as permanently
unallocated dust that the next cycle divides, floors to zero, and finds nothing to do
with — for ever.

### Why this needs no state of its own

`unallocated()` is `usdgHeld - ytSupply`. Once a distribution lands, supply equals the
balance and there is nothing left to hand out. So a restart, a duplicated cycle, or a
crash between simulate and broadcast cannot pay twice: the chain holds the whole of the
state and the keeper holds none of it. Railway recycling the disk costs nothing.

Granting the role, once, from the admin key:

```bash
cast send $REWARD_VAULT "grantRole(bytes32,address)" \
  $(cast call $REWARD_VAULT "DISTRIBUTOR_ROLE()(bytes32)" --rpc-url $RPC_URL) \
  $KEEPER_ADDRESS --rpc-url $RPC_URL --private-key $ADMIN_KEY
```

## What it deliberately does not do

**Declare dividends.** That needs `ORACLE_ROLE` and real corporate action data, and a
keeper that invented either would be inventing payments. Declaration stays a human
decision made against a data source, run through
`contracts/script/DeclareDividends.s.sol` from `contracts/dividends/<chainid>.json`.

Until that file exists, this keeper will start, index holders, find nothing declared,
and say so every cycle. That is the correct behaviour, not a misconfiguration.

## Environment

| variable | required | default | notes |
| --- | --- | --- | --- |
| `RPC_URL` | yes | — | Rate limited public endpoints work; a dedicated one is better. |
| `KEEPER_PRIVATE_KEY` | yes | — | `0x` + 64 hex. Needs ETH for gas, and USDG only if settling. |
| `START_BLOCK` | yes | — | First block to scan for `Deposited`. Use the protocol's deploy block. |
| `CHAIN_ID` | no | `4663` | Must have an address book in the SDK. |
| `SETTLE_ENABLED` | no | `false` | Arms the leg that spends USDG. |
| `REWARDS_ENABLED` | no | `false` | Arms the reward distribution. |
| `REWARD_MIN_USDG` | no | `0.01` | Leave a pot smaller than this alone. Skipping spends nothing and loses nothing. |
| `REWARD_MAX_HOLDERS` | no | `250` | Refuse rather than pay some. See the design note. |
| `DRY_RUN` | no | `false` | Reports what it would do, broadcasts nothing. |
| `POLL_SECONDS` | no | `300` | Cycle interval. |
| `LOG_CHUNK` | no | `10000` | `getLogs` window. Lower it if the RPC rejects the range. |
| `PORT` | no | `8080` | Health endpoint. Railway sets this. |

`START_BLOCK` set past the first deposit means holders are missed silently by the
chain and loudly by this service: it logs `dividends are live but no holders are
indexed`. If you see that line, the block number is wrong.

## Running it

```bash
# One cycle, nothing broadcast. Do this first, every time.
DRY_RUN=1 KEEPER_RUN_ONCE=1 pnpm --filter @drip-markets/keeper start

# One real cycle.
pnpm --filter @drip-markets/keeper once

# The service.
pnpm --filter @drip-markets/keeper start
```

`GET /health` returns the cycle count, the last cycle time and the last error, and
503s when the last cycle failed.

## Design notes

**The chain's clock, never the host's.** Every deadline the contracts check is against
`block.timestamp`. Reading `Date.now()` here made the keeper miss a dividend whose ex
date the chain had already passed.

**Withdrawals do not remove a holder from the index.** Entitlement is decided by
`balanceOfAt` at the ex date, not the balance now, so someone who deposited before an
ex date and withdrew after it is still owed that dividend. `pendingEntitlement`
returns zero for anyone genuinely owed nothing, so carrying extra addresses costs
calldata and never correctness.

**The batch falls back to individuals.** `activateBatch` skips holders already done or
owed nothing, but an advance the pool cannot front reverts inside `_activate` and
takes the whole batch with it. On a batch that will not simulate, the keeper retries
one holder at a time so a single unfundable entitlement cannot block everyone else.
A holder skipped that way keeps their entitlement in full, claimable at the pay date.

**Approvals are per settlement, not per batch.** If the process dies mid-loop nothing
is left standing approved.

**Distribution is one transaction and is never chunked.** A run that landed batch one
and reverted on batch two would leave the pot part spent and the rest to be divided
again on different weights — the same money, split two different ways. All or nothing.
When the holder set outgrows a single transaction the answer is a claim tree, not a
chunked loop that quietly pays some people, which is why the keeper refuses past
`REWARD_MAX_HOLDERS` instead of paying the first few hundred.

**The split is a snapshot of the moment it runs.** Someone can deposit just before a
distribution and withdraw just after, and take a share for having been present for one
block. At current size that is not worth engineering against; at real size it is, and
the fix is to weight by the balance at the funding block rather than at the head.

**Freezing is a duty, not a fallback.** SplitVault freezes on every path that pays
somebody out, so a holder who turns up cannot be short-changed by a matured series.
But nobody has to turn up. Between maturity and the first visitor a real dividend can
land, and every share of it would come out of the Principal Tokens' backing. That
window is the only way the split can pay the wrong person, and this job is what closes
it — which is why it runs whether or not rewards are enabled.

**The vault is the second opinion, not the first.** `RewardVault.distribute` reverts
if it would owe more YT than it holds USDG, so a bug here can only fail closed. The
keeper still scales to the pot itself rather than leaning on that.
