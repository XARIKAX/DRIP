# Osinko keeper

Two jobs, on a timer, against a deployed Osinko protocol.

| job | what it does | costs |
| --- | --- | --- |
| **activate** | Pays holders the moment their entitlement exists, instead of whenever someone remembers to. `activate` is permissionless, so this needs no role. | gas |
| **settle** | On the pay date, pays the protocol what the issuer paid: retires the vault's receivable and makes non-advanced holders claimable. | gas **and the full entitlement in USDG** |

Settlement is off unless `SETTLE_ENABLED=true`. A service that can move the float on
its own should say so out loud before it is allowed to.

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
