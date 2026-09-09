# Osinko keeper

Three jobs, on a timer, against a deployed Osinko protocol.

| job | what it does | costs |
| --- | --- | --- |
| **activate** | Pays holders the moment their entitlement exists, instead of whenever someone remembers to. `activate` is permissionless, so this needs no role. | gas |
| **settle** | On the pay date, pays the protocol what the issuer paid: retires the vault's receivable and makes non-advanced holders claimable. | gas **and the full entitlement in USDG** |
| **rewards** | Accrues each stock's posted reward rate on what people have on deposit and mints the YT that pays it. Needs `DISTRIBUTOR_ROLE` on the reward vault. | gas, out of a pot Osinko funded up front |

Settlement is off unless `SETTLE_ENABLED=true`, and rewards are off unless
`REWARDS_ENABLED=true`. A service that can move the float on its own should say so out
loud before it is allowed to.

## How rewards are worked out

Each listed stock carries a `rewardRatePct` in `contracts/listings/<chainid>.json`.
Every cycle the keeper takes the window since the last distribution and, for each
holder and each stock:

```
accrual = balanceOfAt(holder, stock, windowStart) x price x rate x elapsed / 1 year
```

Three things about that formula are deliberate:

**The balance at the START of the window.** A deposit made two minutes before the
keeper runs earns from the next window, not a full period it was not present for.

**The pot is the hard bound.** If the accruals add up to more than the vault holds
unallocated, every holder is scaled down by the same factor. The posted rate is what
Osinko intends to pay; the pot is what Osinko has; the pot wins. That scaling is also
exactly "split what is in the contract proportionally by deposit value", because each
holder's accrual is their deposit value times its rate.

**A quiet price feed skips its token for that cycle, rather than valuing it at zero.**
Zero would pay that stock's holders nothing while paying everyone else in full. The
accrual is not lost: the window only advances when a distribution actually lands, so
it arrives next cycle once the feed answers.

The window itself is read back off the chain — the block timestamp of the last
`Distributed` log — so a restart cannot re-pay a window that was already paid, and
Railway recycling the disk costs nothing. Before the first distribution there is no
log to read, which is what `REWARD_EPOCH_START` is for. Without it the job declines to
run rather than inventing a start date.

Granting the role, once, from the admin key:

```bash
cast send $REWARD_VAULT "grantRole(bytes32,address)" \
  $(cast keccak "DISTRIBUTOR_ROLE") $KEEPER_ADDRESS \
  --rpc-url $RPC_URL --private-key $ADMIN_KEY
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
| `REWARD_EPOCH_START` | no | — | Unix seconds. Where accrual begins before the first distribution. Without it, rewards decline to run. |
| `REWARD_MIN_USDG` | no | `1` | Do not spend gas below this total. Skipping does not lose the accrual. |
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

**Distribution is one transaction and is never chunked.** The window is derived from
the last `Distributed` log, so a run that landed batch one and reverted on batch two
would advance the window past holders who were never paid. All or nothing keeps the
accounting honest. When the holder set outgrows a single transaction the answer is a
claim tree, not a chunked loop that quietly drops people — which is why the keeper
refuses past `REWARD_MAX_HOLDERS` instead of paying the first few hundred.

**The vault is the second opinion, not the first.** `RewardVault.distribute` reverts
if it would owe more YT than it holds USDG, so a bug here can only fail closed. The
keeper still scales to the pot itself rather than leaning on that.
