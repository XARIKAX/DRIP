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
pnpm install

# 1. a local chain
pnpm chain                      # anvil, chain id 31337, 2s blocks

# 2. deploy + seed + sync ABIs (new terminal)
pnpm contracts:deploy:local     # deploys, declares 3 dividends, funds the vault

# 3. the app (new terminal)
pnpm dev                        # http://localhost:3000
```

Then in the browser: connect a wallet pointed at `http://127.0.0.1:8545` (chain 31337),
faucet AAPL from the dashboard, deposit it, pick a mode, and watch the counter move.

Import one of anvil's printed private keys into the wallet for instant gas.

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
Fund a deployer at the faucet (https://faucet.testnet.chain.robinhood.com), then:

```bash
cd contracts
PRIVATE_KEY=0x... forge script script/Deploy.s.sol --rpc-url robinhood_testnet --broadcast
PRIVATE_KEY=0x... forge script script/Seed.s.sol --rpc-url robinhood_testnet --broadcast
cd .. && pnpm abis
```

Set `apps/web/.env.local`:

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
contracts/         Foundry — 10 protocol contracts, mocks, tests, deploy + seed scripts
packages/sdk/      TypeScript SDK (viem) — typed reads, unsigned write builders
packages/mcp/      MCP server wrapping the SDK
scripts/           deploy-local.sh, sync-abis.mjs
HANDOFF.md         for the Solidity developer taking this to mainnet
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
cd contracts
PRIVATE_KEY=0x... forge script script/Deploy.s.sol --rpc-url robinhood_testnet --broadcast
PRIVATE_KEY=0x... forge script script/Seed.s.sol --rpc-url robinhood_testnet --broadcast
node ../scripts/sync-abis.mjs
```

commit `contracts/deployments/46630.json` plus the regenerated
`packages/sdk/src/generated/deployments.ts`, and the next Vercel deploy is fully
interactive with no code changes.

