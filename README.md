# Osinko — the Aave of dividends

**Osinko** is Finnish for *dividend* — the same language that gave DeFi its ghost.
Aave built the money market for crypto collateral; Osinko builds it for the income
side of tokenized stocks on Robinhood Chain. Ticker **$OSINKO**.

One deposit puts both sides of a portfolio to work. The **income side**: dividends
stream per second and arrive weeks early. The **credit side**: the same holdings back
a USDG line whose interest the dividends pay.

1. **Early** — dividends advanced at the ex date instead of the pay date, funded by a
   USDG vault that earns the 1% advance fee
2. **Stream** — dividend value drips to the wallet per second instead of arriving as a lump
3. **Reinvest** — streamed dividends auto reinvest into more of the same stock token the
   moment they land
4. **Borrow** — USDG credit against deposited stocks; every dividend the collateral
   earns is applied against the interest first, so at a conservative LTV the loan
   carries itself
5. **Split** — the one module that wraps the share: deposit a stock token into
   `SplitVault` and receive a Principal Token (the share, redeemable 1:1 at
   maturity) and a Yield Token (every dividend it pays before then, tradable on
   its own). Merge them back at par, free, any time before maturity. Opt in only —
   Early, Stream, Reinvest and Borrow never touch what a holder holds; this is the
   one path that does, for holders who specifically want the drip to be a liquid
   position rather than a stream or loan collateral
6. **Agent** — every action exposed over MCP so an agent can manage the whole strategy
   from natural language, signing nothing itself

**Split the stock. Trade the dividend. Borrow on both.**

> Testnet build. Every token in here is worthless by design.

## One command local run

Three terminals, or one if you background the first two:

```bash
# 0. prerequisites: node 22+, pnpm 9+, foundry
#    forge-std and openzeppelin are git submodules, so a plain clone has neither and
#    `forge build` fails with "Source not found". Either clone with --recursive or:
git submodule update --init --recursive

pnpm install

# 1. a local chain
pnpm chain                      # anvil, chain id 31337, 2s blocks

# 2. deploy + seed + sync ABIs + point the app at it (new terminal)
pnpm contracts:deploy:local

# 3. the app (new terminal)
pnpm dev                        # http://localhost:3000
```

Then in the browser: connect a wallet pointed at `http://127.0.0.1:8545` (chain 31337),
faucet AAPL from the dashboard, deposit it, pick a mode, and watch the counter move.

Import one of anvil's printed private keys into the wallet for instant gas.

## One command onto a real chain

`scripts/deploy.sh` is the whole path from empty chain to live app, and it is the
same script the local run uses. It compiles, deploys the protocol and the five stock
tokens, seeds the vault and the calendar, copies the address book into the SDK, and
writes `apps/web/.env.local` so `pnpm dev` comes up on the new chain with nothing
else to edit.

```bash
# Fund a deployer first: https://faucet.testnet.chain.robinhood.com
PRIVATE_KEY=0x... pnpm deploy:chain robinhood_testnet
```

Network arguments: `local`, `robinhood_testnet`, `robinhood_mainnet`,
`arbitrum_sepolia`. Any other endpoint works by setting `RPC_URL` and passing no
argument.

| Env var | Effect |
| --- | --- |
| `PRIVATE_KEY` | Deployer key. Required off local, defaults to anvil's first account on it. |
| `RPC_URL` | Overrides the network's default endpoint. Use this for an Alchemy URL. |
| `SEED=0` | Deploy only. No vault funding, no declared dividends. |
| `SEED_EX_LEAD` | Seconds until the first dividend goes ex. 60 local, 900 remote. |
| `VERIFY=1` | Verify sources on the chain's Blockscout. `VERIFIER_URL` overrides the endpoint. |
| `DEPLOY_MOCKS_TO_MAINNET=1` | Required to target a non-testnet chain with the testnet script. See below. |
| `PRODUCTION=1` + `ADMIN=0x...` | Run the production deploy instead. See "Robinhood Chain mainnet". |
| `FUND=<usdg>` | Deposit that many whole USDG into the pool from the deployer's wallet. |
| `DECLARE=1` | Declare the calendar in `contracts/dividends/<chainid>.json`. |

It refuses to start rather than half-deploy: no chain answering, no key, or no gas on
the deployer each stop it before the first transaction. It also refuses any chain that
is not a known testnet, because `Deploy.s.sol` deploys mock USDG and five
faucet-minting mock stock tokens unconditionally — fine on a testnet, an incident on a
chain carrying real money. Production swaps the real addresses in first
(`HANDOFF.md` §7); `DEPLOY_MOCKS_TO_MAINNET=1` overrides the check if you genuinely
want the mocks there.

Two generated files carry the result into the frontend, and both belong in the commit:

```
contracts/deployments/<chainid>.json         written by Deploy.s.sol
packages/sdk/src/generated/deployments.ts    written by scripts/sync-abis.mjs
```

`apps/web/.env.local` is gitignored on purpose — the same five variables go into the
Vercel project instead, and the script prints them ready to paste.

## Demo mode

The app boots into demo mode: a seeded portfolio with live streams accruing per
second, three weeks of history, a funded vault, and a working agent console. Every
page renders and every interaction works with no wallet, ever. Connecting a wallet
swaps the data source from the in-memory demo store to chain reads; it never gates
the UI. The seam is `apps/web/src/lib/data/` — one `DataProvider`, two
implementations, and components never know which one they are on.

## Docs

The protocol documentation ships inside the app at `/docs`
(https://www.osinko.app/docs): the mechanism module by module, every number a
contract enforces, roles and trust assumptions, settlement and clawback, the agent
tools and SDK, and how to use the app — with diagrams and screenshots, numbered like
a prospectus, and bound to the same live data as the dashboard. It says what Osinko
is in one line: the Aave of stocks.

## Robinhood Chain testnet

The real target: chain id 46630, an Arbitrum Orbit L2, public since February 2026.
Fund a deployer at the faucet (https://faucet.testnet.chain.robinhood.com), then one
command does the whole thing:

```bash
PRIVATE_KEY=0x... pnpm deploy:chain robinhood_testnet
```

It writes `apps/web/.env.local` itself:

```
NEXT_PUBLIC_CHAIN_ID=46630
NEXT_PUBLIC_CHAIN_NAME=Robinhood Chain Testnet
NEXT_PUBLIC_RPC_URL=https://rpc.testnet.chain.robinhood.com/rpc
NEXT_PUBLIC_EXPLORER_NAME=Robinhood Chain Explorer
NEXT_PUBLIC_EXPLORER_URL=https://explorer.testnet.chain.robinhood.com
```

The public RPC is rate limited; use an Alchemy Robinhood testnet endpoint for real
work. Arbitrum Sepolia (chain 421614, `--rpc-url arbitrum_sepolia`) remains a drop
in stand in with the same Orbit stack semantics: change the five env vars and
nothing else.

## Robinhood Chain mainnet

Chain id 4663. Real USDG, real stock tokens, real money.

The testnet deploy and the mainnet deploy are two different scripts, not one script
with a flag. `Deploy.s.sol` exists to make a testnet feel alive, and deploys mock
USDG, five faucet-minting mock stock tokens and a fixed price venue to do it.
`DeployProduction.s.sol` deploys protocol code only and takes every other address
from `contracts/listings/4663.json`.

### Before you deploy

1. **The listing universe is the input.** `contracts/listings/4663.json` holds 16
   stock tokens with their Chainlink USD feeds and Uniswap routes, plus the routing
   infra. 15 are enabled; SPCX is off, never traded. Nothing outside that file gets
   deployed, and a token with no feed is refused — the first listing rule.

2. **Verify it onchain.** The deploy runs this for you, and it is worth running alone
   first:

   ```bash
   forge script script/VerifyUniverse.s.sol --rpc-url robinhood_mainnet --root contracts
   ```

   It hard-fails on any mismatch: symbol, decimals, feed liveness inside the 1 hour
   heartbeat, both swap legs quoted through QuoterV2, and the quote bounded against
   the Chainlink price.

3. **Decide who ADMIN is.** Every role goes to it — oracle, keepers, pausers, fee
   setters. `HANDOFF.md` §5 ranks the oracle key as the largest trust assumption in
   the protocol, so this should be a multisig, ideally behind a timelock. The
   deployer keeps nothing: the script grants ADMIN everything, renounces the
   deployer's own roles, and asserts it holds none of them before it finishes.

### Deploy

```bash
ADMIN=0xYourMultisig PRIVATE_KEY=0x... PRODUCTION=1 pnpm deploy:chain robinhood_mainnet
```

That verifies the universe, deploys `ChainlinkPriceOracle` and
`UniswapV3SwapAdapter` against the chain's own SwapRouter02, deploys the six protocol
contracts against real USDG, registers one Chainlink feed per listed token, wires the
modules, hands every role to ADMIN, and writes `contracts/deployments/4663.json`.

It refuses to start if ADMIN is unset, if there is no listing file for the chain, if
USDG is not 6 decimals, if any listed token's `symbol()` disagrees with the file, if
any token is not 18 decimals, or if any feed is not answering.

Seeding is off and cannot be turned on: a seeded calendar on mainnet would be the
protocol asserting a dividend no issuer ever declared.

### After

```bash
pnpm abis          # copy the address book into the SDK
```

Commit `contracts/deployments/4663.json` and the regenerated
`packages/sdk/src/generated/deployments.ts`, then set the five vars in Vercel:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_CHAIN_ID` | `4663` |
| `NEXT_PUBLIC_CHAIN_NAME` | `Robinhood Chain` |
| `NEXT_PUBLIC_RPC_URL` | `https://rpc.mainnet.chain.robinhood.com` |
| `NEXT_PUBLIC_EXPLORER_NAME` | `Blockscout` |
| `NEXT_PUBLIC_EXPLORER_URL` | `https://robinhoodchain.blockscout.com` |

The app reads `mocks: false` from the mainnet book and hides its faucets; real stock
tokens have none. Nothing else in the frontend changes.

### Making it a market

A deploy leaves correct contracts with nothing in them. Three things fill them, and
each needs an input the repo cannot produce.

**1. Pool capital.** The pool fronts every advance and every loan. With nothing in it,
Early pays nothing and Borrow lends nothing.

```bash
AMOUNT=250000 PRIVATE_KEY=0x... forge script script/FundPool.s.sol \
  --rpc-url robinhood_mainnet --broadcast --root contracts
```

The USDG has to already be in that wallet. The depositor gets ERC-4626 shares and can
withdraw whatever is not currently lent — seeding the pool is not a donation.

**2. The dividend calendar.** `contracts/dividends/<chainid>.json` lists what each
stock pays and when; `DeclareDividends.s.sol` puts it on the calendar, skipping
anything already there so a scheduled keeper can re-run it safely.

```bash
PRIVATE_KEY=0x... forge script script/DeclareDividends.s.sol \
  --rpc-url robinhood_mainnet --broadcast --root contracts
```

**That JSON file has to be built from real issuer corporate action data, and nothing
in this repo can produce it.** A declared dividend makes the pool advance real USDG at
the ex date; if the issuer never declared it, that money is gone and the loss lands on
the LPs. Whoever holds `ORACLE_ROLE` is accountable for every row. See
`contracts/dividends/README.md`.

**3. The pay-day keeper.** When issuers pay, settle:

```bash
DRY_RUN=1 forge script script/SettleDividends.s.sol --rpc-url robinhood_mainnet --root contracts
PRIVATE_KEY=0x... forge script script/SettleDividends.s.sol --rpc-url robinhood_mainnet --broadcast --root contracts
```

The dry run reports what is due and what it costs; run it first, every time. The keeper
wallet must hold the USDG the settlement pulls. Where that comes from is the open
question in `HANDOFF.md` §7 — a bank question, not a code one.

On a testnet all three can ride along with the deploy:

```bash
FUND=250000 DECLARE=1 PRIVATE_KEY=0x... pnpm deploy:chain robinhood_testnet
```

### What the app shows, and what it cannot

Every page reads chain state once a wallet is connected to a deployed chain. Two
numbers the reference portfolio draws have no onchain source, and the app shows a
dash rather than a figure:

- **Today's price move and the sparkline.** The oracle answers one price, now. There
  is no intraday series to read, and drawing a plausible line next to somebody's real
  money is worse than drawing nothing.
- **The pool's APY history.** One point, from fees actually earned over the pool's
  life. A curve would be a past this pool never had.

### What is still not true after all that

- **No audit.** The credit side in particular is new code holding LP money.
- **`ADMIN` should be a multisig behind a timelock.** The script takes whatever
  address it is given.
- **No market for share tokens or dividend tokens.** Split mints them, they transfer,
  and the whole cut/collect/rejoin loop works onchain — but nothing trades them, so
  the Split page shows no implied yield rather than inventing one.
- **Liquidators sell seized stock themselves.** The adapter is wired for an
  oracle-bounded sale through SwapRouter02; nothing calls it yet.

## Tests

```bash
pnpm contracts:test    # 96 tests: unit, fuzz, integration, invariants
pnpm typecheck         # sdk + mcp + web
```

## MCP server

```bash
pnpm mcp               # stdio transport
```

Tools: `get_positions`, `get_streams`, `get_calendar`, `get_vault` answer directly;
`set_mode`, `claim_stream`, `deposit` return **unsigned** transactions for the user's
wallet. The server holds no keys and cannot execute anything.

Point an MCP client at it with:

```json
{
  "mcpServers": {
    "osinko": {
      "command": "pnpm",
      "args": ["--filter", "@drip-markets/mcp", "start"],
      "env": { "DRIP_RPC_URL": "http://127.0.0.1:8545", "DRIP_CHAIN_ID": "31337" }
    }
  }
}
```

## Repo

```
apps/web/          Next.js app — home, dashboard, deposit, borrow, split, vault, calendar, agent, docs
contracts/         Foundry — 11 protocol contracts, mocks, tests, deploy + keeper scripts
packages/sdk/      TypeScript SDK (viem) — typed reads, unsigned write builders
packages/mcp/      MCP server wrapping the SDK
scripts/           deploy.sh (any chain), deploy-local.sh, sync-abis.mjs, capture-shots.mjs
HANDOFF.md         for the Solidity developer taking this to mainnet
```

## The design system

The concept is a garden: a garden pays you without being cut down, which is the same
thing the protocol says about a share. It is documented where it lives — read the
header of `apps/web/tailwind.config.ts` first, then `apps/web/src/app/globals.css`.

Three things about it are worth knowing before changing anything:

- **Surface is a context, not a second vocabulary.** `.night` redeclares a dozen
  semantic variables and panels opt into it by definition, so `text-ink`, `bg-paper`
  and `border-line` are correct on both light and dark surfaces. There is no
  `text-panel-muted`.
- **The garden is drawn in code.** `apps/web/src/components/pixel/` renders sprites as
  run-length-merged SVG rectangles at whole multiples of a `--cell` unit. The
  generators are integer-only and seeded from literals, because they run on the server
  and again in the browser and one differing bit is a torn tree. `/dev/pixel` shows
  every sprite at three scales.
- **Type is self-hosted** in `apps/web/public/fonts`. Nothing reaches the network at
  build time or at runtime.

Documentation screenshots and the social card are generated, not taken by hand:

```bash
pnpm --filter @drip-markets/web build
pnpm shots        # rewrites public/docs/*.webp, shots.ts, and opengraph-image.png
```

## Where things stand

Phase 1 (this repo): product UI on testnet, contracts in simplified but architecturally
correct form, everything wired end to end.

Phase 2 (human Solidity developer): harden and deploy production contracts. Start with
`HANDOFF.md` — it lists the trust assumptions, the testnet → production deltas, and the
audit checklist. The interfaces are frozen so the frontend survives the swap unchanged.

## Deploy the web app on Vercel

The site is a static Next.js app that talks straight to an RPC, so hosting is one
import with no backend:

1. Go to [vercel.com/new](https://vercel.com/new) and import this repository.
2. Set **Root Directory** to `apps/web`. Vercel detects Next.js and the pnpm
   workspace on its own; leave install and build commands at their defaults.
3. Add the environment variables that point the build at Robinhood Chain testnet
   (chain id 46630, public since February 2026):

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_CHAIN_ID` | `46630` |
   | `NEXT_PUBLIC_CHAIN_NAME` | `Robinhood Chain Testnet` |
   | `NEXT_PUBLIC_RPC_URL` | `https://rpc.testnet.chain.robinhood.com/rpc` |
   | `NEXT_PUBLIC_EXPLORER_NAME` | `Robinhood Chain Explorer` |
   | `NEXT_PUBLIC_EXPLORER_URL` | `https://explorer.testnet.chain.robinhood.com` |

   The public RPC is rate limited; for a site with real traffic use an Alchemy
   Robinhood testnet endpoint instead. Arbitrum Sepolia (chain 421614) remains a
   drop in alternative with the same Orbit stack semantics.

4. Deploy.

Until the contracts are deployed to Robinhood Chain testnet, the landing page,
design system and copy are fully live and the app pages show their no-deployment
state. To go fully interactive: fund a deployer wallet at the faucet
(https://faucet.testnet.chain.robinhood.com), then

```bash
PRIVATE_KEY=0x... pnpm deploy:chain robinhood_testnet
```

commit `contracts/deployments/46630.json` plus the regenerated
`packages/sdk/src/generated/deployments.ts`, and the next Vercel deploy is fully
interactive with no code changes.

