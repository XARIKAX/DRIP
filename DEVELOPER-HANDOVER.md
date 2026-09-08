# Osinko — developer handover

Read this first. It says what Osinko is, what exists, what is real versus sample,
and what to do next, in order. The deep Solidity notes are in `HANDOFF.md`; the
product explanation is live at https://www.osinko.app/docs.

## 1. What it is, in one minute

Osinko is a money market for tokenized stocks on Robinhood Chain — the Aave of
stocks. A user deposits a Robinhood stock token. From then on, every dividend that
stock pays can be:

- **Paid early** — the day the user qualifies (the ex date), not three weeks later on
  pay day. A pool of USDG fronts the cash and takes a 1% fee.
- **Paid every second** — from the ex date to pay day, collectable at any time.
- **Turned into more stock** — each collect buys more of the same stock, same transaction.
- **Used to pay a loan** — the user borrows USDG against the stock, and dividends go to
  the interest first. (App only today; contract designed, not built. See §3.)
- **Split off and sold** — one share becomes a share token (redeems for the stock on an
  end date) and a dividend token (collects every dividend until then).
- **Driven by an agent** — natural language in, unsigned transactions out. The agent
  can never sign.

The headline is fixed: **Split the stock. Trade the dividend. Borrow on both.**

## 2. What is in the repo

```
contracts/     Foundry. 10 contracts, 96 tests passing (unit, fuzz, integration, invariants).
packages/sdk/  TypeScript (viem). Typed reads (DripReader), unsigned tx builders, listing table.
packages/mcp/  MCP server for agents. 4 read tools, 3 write tools. Holds no keys.
apps/web/      Next.js 14 site + app. Landing, dashboard, deposit, borrow, split, pool,
               calendar, agent console, and the guide at /docs.
scripts/       deploy-local.sh (anvil → deploy → seed → sync ABIs), sync-abis.mjs
HANDOFF.md     Solidity handoff: trust assumptions, roles, invariants, audit checklist,
               the LendingPool spec (§13), SplitVault review notes (§14).
```

One branch: `claude/drip-dividend-layer-6o6kpv`. There is no `main`. Vercel deploys
the site from this branch to https://www.osinko.app.

## 3. What is real and what is not — be clear with yourself about this

| Piece | State |
|---|---|
| Early, Stream, Reinvest contracts (`DividendRegistry`, `DripCore`, `AdvanceVault`, `StreamEngine`, `Reinvestor`) | **Built and tested.** Deployed only to a local Anvil chain. **Not deployed to Robinhood Chain.** |
| Split contracts (`SplitVault`, `PrincipalToken`, `YieldToken`) | **Built and tested** (13 tests). Wired into `Deploy.s.sol`. Not deployed anywhere but local. |
| Borrow (`LendingPool`) | **Not built.** Fully specified in `HANDOFF.md §13`. The app's Borrow page runs entirely on the sample data store. |
| Production adapters (`ChainlinkPriceOracle`, `UniswapV3SwapAdapter`) | **Built**, written against Robinhood Chain mainnet (chain 4663). Not deployed. `VerifyUniverse.s.sol` checks the stock list on chain. |
| The website | **Live** at osinko.app. Every page runs on a seeded in-memory **sample portfolio** until a wallet connects to a chain with a deployed address book. Today no such chain exists, so the site is effectively a working demo. The word "demo" was removed from the copy on purpose; the behaviour is unchanged. |
| A market to trade share tokens / dividend tokens | **Does not exist.** The "dividend yield" shown on the Split page is the stock's plain yearly yield, not a market price. |
| Audit | **None yet.** |

The single most important thing to understand: **nothing is on Robinhood Chain yet.**
The first real milestone is a deployment.

## 4. How the app is put together

- **One data seam.** `apps/web/src/lib/data/provider.tsx` exposes hooks (`useHoldings`,
  `useStreamRows`, `useCreditView`, `useSplitSeries`…). Each hook reads from
  `mock.ts` (the sample store) or from the chain via the SDK, depending on whether a
  wallet is connected *and* an address book exists for that chain. Pages never know
  which. To make the site real, deploy contracts and commit the address book; the UI
  needs no changes.
- **Address books** live in `contracts/deployments/<chainId>.json` and are copied into
  `packages/sdk/src/generated/deployments.ts` by `pnpm abis`. Only `31337.json` exists.
- **Chain config** is `apps/web/src/lib/chain.config.ts`. Five env vars point the build
  at a chain: `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_CHAIN_NAME`, `NEXT_PUBLIC_RPC_URL`,
  `NEXT_PUBLIC_EXPLORER_NAME`, `NEXT_PUBLIC_EXPLORER_URL`. Values are sanitised; a
  broken chain id falls back to Robinhood Chain.
- **Design system** is documented at the top of `apps/web/tailwind.config.ts` and in
  `globals.css`. Bodoni Moda for display, Archivo for UI, IBM Plex Mono for every number.
  Paper ground, one cyan accent, dark panels only for data. Square corners everywhere
  except pills. Don't fight it; it is the brand.
- **Copy rules** (the owner is firm on these): eighth-grade reading level, no jargon, no
  mention of "testnet" or "demo" anywhere a user can see. Say "the pool" not "vault",
  "safety score" not "health factor", "share token / dividend token" not "PT / YT",
  "collect" not "claim". The product is "the Aave of stocks".
- **Docs** are one React page: `apps/web/src/components/docs/Docs.tsx`, with diagrams in
  `figures.tsx` and product screenshots in `apps/web/public/docs/` (captured by a
  Playwright script; recapture if the UI changes materially).

## 5. Run it

```bash
pnpm install
pnpm chain                     # anvil on 31337
pnpm contracts:deploy:local    # deploy, seed 3 dividends, fund the pool, sync ABIs
pnpm dev                       # http://localhost:3000

pnpm contracts:test            # 96 tests
pnpm typecheck                 # sdk + mcp + web
pnpm --filter @drip-markets/web build
```

There is no ESLint config, so `next build` does not lint. Typecheck is the gate.

## 6. What to do next, in order

1. **Deploy to Robinhood Chain.** Testnet (46630) first, then mainnet (4663). Fund a
   deployer, run `Deploy.s.sol` then `Seed.s.sol`, `pnpm abis`, commit
   `contracts/deployments/<chainId>.json` and the regenerated SDK file, set the five
   env vars on Vercel. The site becomes real with no code changes. Before mainnet, run
   `VerifyUniverse.s.sol` against 4663 and swap the mock adapters for the real ones
   (`HANDOFF.md §7–8`).
2. **Replace the mocks in production.** Real USDG (6 decimals), real stock tokens
   (18 decimals — verify), `UniswapV3SwapAdapter`, `ChainlinkPriceOracle`. Delete
   `contracts/src/mocks/` from the production deployment.
3. **Build `LendingPool`** to the spec in `HANDOFF.md §13`: collateral is stock already
   in `DripCore`, USDG from the same pool, 40% max LTV, 65% liquidation, 50% close
   factor, 5% bonus, kinked rate (2% base → 8% at 80% utilisation), dividends routed
   to interest first. The app's Borrow page and agent commands already expect exactly
   this shape; wire the chain branch of `useDataActions` and the Borrow hooks.
4. **A market for share tokens and dividend tokens.** Without one, Split is half a
   feature. Simplest first version: a constant-sum or Uniswap v3 pool per series.
5. **Harden for money** (`HANDOFF.md §5, §6, §11`): oracle multisig and notice period,
   clawback priced from the oracle, withdrawal delay on positions with a live advance,
   all admin roles behind a timelock, then an audit.
6. **Operations.** Someone has to run the dividend oracle (announce/cancel), the pay-day
   keeper (`settleDividend`, `clawback`), and a claim keeper. Decide who, and what data
   source feeds the oracle.
7. **Small web items.** Install `sharp` in `apps/web` so `next start` optimises images
   natively; add an OG image per route; add analytics if wanted.

## 7. Numbers the code enforces

| Parameter | Value | Hard ceiling |
|---|---|---|
| Early payment fee | 1% | 5% |
| Pool lent out | 80% max | 95% |
| Ex date → pay day | ≤ 90 days | — |
| Max borrow (spec) | 40% of collateral | — |
| Liquidation (spec) | 65%, close factor 50%, bonus 5% | — |
| Split fee | 0.1% | 1% |
| Reinvest price tolerance | 1% default | 10% |
| Chainlink staleness | 1 hour | — |

Three invariants the tests enforce and every change must keep: the pool's cash always
covers what it owes and never exceeds the lending limit; no payout ever pays more than
its total; the stock `DripCore` holds equals the sum of all balances.

## 8. Where to look when something is unclear

- Product behaviour and every number, in plain words: https://www.osinko.app/docs
- Contract-level detail, trust model, audit list, specs: `HANDOFF.md`
- Setup and deploy commands: `README.md`
- Interfaces the frontend depends on (frozen): `contracts/src/interfaces/`
- Events the frontend indexes (frozen signatures): `HANDOFF.md §10`
