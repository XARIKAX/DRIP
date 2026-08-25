# Drip Markets — the dividend layer for Robinhood Chain

Ticker **$DRIP**, backronym **Dividend Reinvestment Plan**: the same name as the thing
it replaces, with none of the limits.

Stock tokens on Robinhood Chain pay dividends the old way: offchain, weeks late, in
quarterly lumps, only inside the Robinhood app. Drip Markets fixes all three onchain.

1. **Early** — dividends advanced at the ex date instead of the pay date, funded by a
   USDG vault that earns the 1% advance fee
2. **Stream** — dividend value drips to the wallet per second instead of arriving as a lump
3. **DRIP** — streamed dividends auto reinvest into more of the same stock token the
   moment they land
4. **Agent** — every action exposed over MCP so an agent can manage a dividend strategy
   from natural language, signing nothing itself

**Get paid before Wall Street does.**

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

## Arbitrum Sepolia

```bash
cd contracts
PRIVATE_KEY=0x... forge script script/Deploy.s.sol --rpc-url arbitrum_sepolia --broadcast
PRIVATE_KEY=0x... forge script script/Seed.s.sol --rpc-url arbitrum_sepolia --broadcast
cd .. && pnpm abis
```

Set `apps/web/.env.local`:

```
NEXT_PUBLIC_CHAIN_ID=421614
NEXT_PUBLIC_CHAIN_NAME=Arbitrum Sepolia
NEXT_PUBLIC_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
NEXT_PUBLIC_EXPLORER_NAME=Arbiscan
NEXT_PUBLIC_EXPLORER_URL=https://sepolia.arbiscan.io
```

Arbitrum Sepolia stands in for Robinhood Chain (both are Arbitrum stack). When
Robinhood Chain testnet access lands, change these five env vars and nothing else.

## Tests

```bash
pnpm contracts:test    # 74 tests: unit, fuzz, integration, invariants
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
    "drip-markets": {
      "command": "pnpm",
      "args": ["--filter", "@drip-markets/mcp", "start"],
      "env": { "DRIP_RPC_URL": "http://127.0.0.1:8545", "DRIP_CHAIN_ID": "31337" }
    }
  }
}
```

## Repo

```
apps/web/          Next.js app — home, dashboard, deposit, vault, calendar, agent console
contracts/         Foundry — 6 protocol contracts, mocks, tests, deploy + seed scripts
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
3. Add the environment variables that point the build at a public chain:

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_CHAIN_ID` | `421614` |
   | `NEXT_PUBLIC_CHAIN_NAME` | `Arbitrum Sepolia` |
   | `NEXT_PUBLIC_RPC_URL` | `https://sepolia-rollup.arbitrum.io/rpc` |
   | `NEXT_PUBLIC_EXPLORER_NAME` | `Arbiscan` |
   | `NEXT_PUBLIC_EXPLORER_URL` | `https://sepolia.arbiscan.io` |

4. Deploy.

Until the contracts are deployed to Arbitrum Sepolia (deploy with
`forge script script/Deploy.s.sol --rpc-url arbitrum_sepolia --broadcast`, run the
seed script, then commit the `contracts/deployments/421614.json` address book and
`pnpm abis`), the landing page, design system and copy are fully live and the app
pages show their no-deployment state. Once the address book for chain 421614 is
committed, the next Vercel deploy is fully interactive with no code changes.

