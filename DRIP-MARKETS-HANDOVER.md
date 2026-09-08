# Drip Markets — developer handover

This document covers **only the Drip Markets work**: everything built from the first
commit up to and including `b0d2dc9` ("Adopt the Robinhood Chain mainnet listing
universe"). Nothing after that commit is part of this handover. The later rebrand,
the Borrow module, the Split module and the `/docs` site belong to a different product
and a different developer.

The code you are receiving is exactly the tree on the git branch **`drip-markets`**
(repo `XARIKAX/DRIP`). Check it out and you have the whole thing:

```bash
git clone https://github.com/XARIKAX/DRIP drip-markets
cd drip-markets
git checkout drip-markets
```

Ignore every other branch in the repo. They contain the later product.

Deep contract notes are in `HANDOFF.md` in the same tree. Setup and run commands are
in `README.md`. This file is the map that ties them together and says what is real.

---

## 1. What Drip Markets is

Drip Markets is a **dividend layer for tokenized stocks on Robinhood Chain**. Ticker
**$DRIP**, backronym Dividend Reinvestment Plan. Slogan: **"Get paid before Wall
Street does."**

Stock tokens on Robinhood Chain pay dividends the old way: off chain, weeks late, in
quarterly lumps, only inside the Robinhood app. Drip Markets moves that on chain and
fixes all three. A holder deposits a stock token into the protocol and picks one of
three modes for how each dividend is paid:

| Mode (on chain enum) | What the holder gets |
|---|---|
| `CASH_EARLY` | The dividend in USDG at the **ex date**, weeks before the pay date. A USDG vault fronts the cash and keeps a 1% fee. |
| `STREAM` | The dividend accrues **per second** from ex date to pay date. Claim any time. |
| `REINVEST` | Every claim is swapped into **more of the same stock** and credited back to the position, in the same transaction. |

Four product modules sit on top of that: **Early**, **Stream**, **DRIP** (reinvest)
and **Agent** (every action exposed to an AI agent over MCP, unsigned transactions
only). There is no lending and no token splitting in Drip Markets.

## 2. Timeline of the work (10 commits)

| Commit | What it did |
|---|---|
| `116b920` | Built the whole thing in one pass: 5 protocol contracts + interfaces + mocks, Foundry tests with invariants, deploy/seed scripts, viem SDK, MCP server, Next.js site and app. |
| `338085c` | Named it Drip Markets / $DRIP (was "$DRIP dividend layer" working title). |
| `c077486` | Documented one click Vercel deployment (root dir `apps/web`, five env vars). |
| `b4b0692`, `e95ef4e` | Targeted the live Robinhood Chain **testnet** (chain id 46630); official RPC path. |
| `45e2d30` | Loaded the wallet stack client side only so Vercel prerender does not crash. |
| `6534cfc` | Sanitised env values (a quoted chain id once took the site down); added `error.tsx` and `global-error.tsx`. |
| `422b2c5` | Set **dripmarkets.net** as the canonical site URL and OG metadata. |
| `f7f6983` | Design v2: **demo mode everywhere** (seeded in memory portfolio), dark data surfaces, real motion, ticker strip, hero counter, dashboard preview. |
| `b0d2dc9` | Adopted the Robinhood Chain **mainnet** (4663) listing universe: `contracts/listings/4663.json`, `ChainlinkPriceOracle`, `UniswapV3SwapAdapter` rewritten for SwapRouter02, `VerifyUniverse.s.sol`, SDK `listings` export. Tests went from 74 to 83. |

## 3. What is in the tree

```
contracts/           Foundry, solc 0.8.28, OpenZeppelin 5, evm cancun
  src/               DividendRegistry, DripCore, AdvanceVault, StreamEngine, Reinvestor
  src/interfaces/    DripTypes, IDividendRegistry, IDripCore, IAdvanceVault,
                     IStreamEngine, IReinvestor, ISwapAdapter, IPriceOracle   (FROZEN)
  src/adapters/      ChainlinkPriceOracle, UniswapV3SwapAdapter            (production)
  src/mocks/         MockUSDG (6dp), MockStockToken (18dp), MockSwapAdapter,
                     MockPriceOracle                                        (delete for prod)
  test/              one suite per contract + Integration + ChainlinkPriceOracle,
                     test/invariant/ handler driven suite                  (83 tests)
  script/            Deploy.s.sol (writes deployments/<chainId>.json), Seed.s.sol,
                     VerifyUniverse.s.sol
  deployments/       31337.json only (local anvil)
  listings/          4663.json — the 16 token mainnet universe
packages/sdk/        @drip-markets/sdk — viem. DripReader (typed reads), build*() unsigned
                     tx builders, chains (foundry, arbitrumSepolia, robinhoodTestnet,
                     robinhoodMainnet), listings table, generated ABIs + address books
packages/mcp/        @drip-markets/mcp — MCP server over stdio. 4 read tools, 3 write tools.
apps/web/            @drip-markets/web — Next.js 14, Tailwind 3, wagmi 2, viem 2, RainbowKit 2
  src/app/page.tsx           landing
  src/app/app/               dashboard, deposit, vault, calendar, agent
  src/lib/data/              the data seam: types.ts, mock.ts (demo store), provider.tsx
  src/lib/chain.config.ts    the one file that knows about the network
  src/lib/intents.ts         natural language → intent parser for the agent console
  src/components/            UtilityBar, SiteNav, TickerStrip, HeroCounter,
                             DashboardPreview, DemoBanner, TxBar, charts, live, ui…
scripts/             deploy-local.sh (anvil → deploy → seed → fast forward → sync ABIs),
                     sync-abis.mjs (ABIs + address books → packages/sdk/src/generated)
HANDOFF.md           Solidity handoff: architecture, roles, trust model, clawback,
                     testnet → production checklist, mainnet universe rules, invariants,
                     event surface, audit checklist
README.md            run, test, deploy, Vercel
```

About 11,800 lines of hand written code across 112 tracked files.

## 4. How the protocol works

Full diagram and money flow are in `HANDOFF.md §1`. The short version:

1. An **oracle** declares `(stockToken, amountPerToken, exDate, payDate)` in
   `DividendRegistry`. Ex to pay must be 90 days or less.
2. Holders deposit stock into `DripCore`. **Only stock deposited before the ex date is
   eligible.** Eligibility is proven from DripCore's own checkpoint history
   (`Checkpoints.Trace208` keyed by timestamp), never from wallet snapshots. This is
   the one design decision that shapes everything. Do not change it.
3. At the ex date anyone calls `DripCore.activate(dividendId, user)`. Core computes the
   entitlement, books the gross in `AdvanceVault` (the 1% fee is recognised there) and
   opens a per second stream in `StreamEngine` for the net.
4. The holder claims when they like. In `REINVEST` mode the cash goes to `Reinvestor`,
   which swaps USDG → stock through `ISwapAdapter` with a slippage guard and credits
   the stock back into the holder's DripCore position.
5. At the pay date a keeper calls `DripCore.settleDividend`, which pulls the issuer's
   USDG, repays the vault's receivable and parks the remainder for holders who never
   activated (`claimSettled`, no fee).
6. If the dividend is cancelled the oracle voids it and a keeper runs `clawback` per
   activated holder: cancel the undrawn stream, seize stock worth the cash already
   paid, write off the receivable.

`AdvanceVault` is an ERC-4626 USDG vault with the identity
`totalAssets = cash + receivables − obligations`, a **cash floor** (cash ≥ obligations
after every booking) and a **utilisation cap** (default 80%, admin ceiling 95%). Share
inflation is killed with a decimals offset of 3.

### Numbers the code enforces

| Parameter | Default | Ceiling |
|---|---|---|
| Advance fee | 1% | 5% (`MAX_FEE_BPS`) |
| Vault utilisation | 80% | 95% |
| Ex → pay window | — | 90 days (`MAX_SETTLEMENT_WINDOW`) |
| Reinvest slippage | 1% | 10% |
| Chainlink staleness | 1 hour | — |
| USDG decimals | 6 (hard coded) | — |
| Stock decimals | 18 (hard coded `ONE_STOCK`) | — |

### Roles

`DEFAULT_ADMIN_ROLE` everywhere; `ORACLE_ROLE` and `SETTLER_ROLE` on the registry;
`KEEPER_ROLE` on DripCore and StreamEngine; `CORE_ROLE` / `REINVESTOR_ROLE` for
contract to contract calls. The rule the wiring enforces: **only protocol contracts
move protocol money.** Humans feed data, pay money in, or push money to its rightful
owner. Canonical wiring is `Deploy.s.sol::_wire()`, mirrored in `test/DripTestBase.sol`.

### Invariants (tested, must stay green)

1. Vault solvency: `cash ≥ obligations` and utilisation ≤ cap, always.
2. Streams never overpay: `claimed ≤ total`, totals equal booked net entitlement.
3. Custody honesty: Σ positions == `token.balanceOf(DripCore)` == `totalDeposited`.

Plus `test_HandlerReachesEveryState`, which fails if the invariant handler stops
reaching deep states.

## 5. SDK and MCP server

**SDK** (`packages/sdk`): `getDeployment(chainId)`, `knownChainIds()`, `DripReader`
(positions, streams, calendar, vault view), and unsigned builders: `buildApprove`,
`buildDeposit`, `buildWithdraw`, `buildSetMode`, `buildActivate`, `buildClaimStream`,
`buildClaimSettled`, `buildSetMaxSlippage`, `buildVaultDeposit`, `buildVaultWithdraw`,
`buildStockFaucet`, `buildUsdgFaucet`. `listings` is the typed 4663 universe. Ships as
TypeScript source; the web app transpiles it (`transpilePackages`).

**MCP** (`packages/mcp`, server name `drip-markets`): reads `get_positions`,
`get_streams`, `get_calendar`, `get_vault`; writes `set_mode`, `claim_stream`,
`deposit`. Writes return **unsigned transactions**. The server holds no keys. Env:
`DRIP_RPC_URL`, `DRIP_CHAIN_ID`. Run with `pnpm mcp`.

## 6. The web app

- **Demo mode is the default.** `apps/web/src/lib/data/mock.ts` is a seeded,
  deterministic in memory portfolio: five positions, two streams accruing by the wall
  clock, a pending advance, three weeks of history, a funded vault, a working agent
  console. Every page works with no wallet. A `DemoBanner` says so.
- **One data seam.** `provider.tsx` exposes hooks; each reads from the mock store or
  from chain via the SDK depending on whether a wallet is connected **and** an address
  book exists for that chain. Pages never know which. Deploy contracts, commit the
  address book, and the site becomes real with no UI changes.
- **Chain config** is `chain.config.ts`. Five env vars: `NEXT_PUBLIC_CHAIN_ID`,
  `NEXT_PUBLIC_CHAIN_NAME`, `NEXT_PUBLIC_RPC_URL`, `NEXT_PUBLIC_EXPLORER_NAME`,
  `NEXT_PUBLIC_EXPLORER_URL`. Values are sanitised; a set but broken chain id falls
  back to 46630, unset falls back to 31337.
- **Wallet stack** (wagmi + RainbowKit) loads client side only. `next.config.mjs`
  ignores a handful of optional peers the connectors reach for.
- **Design system** (documented at the top of `tailwind.config.ts`): white paper, near
  black ink, one cyan accent `#35C2DB`, square corners everywhere except pills, hairline
  rules, Archivo for UI, IBM Plex Mono for every number. App data surfaces run dark
  (`#0C0E10` panels). "NYSE structure, Bloomberg confidence, TradingView data quality."
- **Agent console** (`/app/agent`) parses natural language with `intents.ts` into the
  same actions the MCP server exposes, and shows the unsigned transaction.
- **Canonical URL** in metadata is `https://dripmarkets.net`. Change it if the domain
  changes.

## 7. Mainnet listing universe (chain 4663)

`contracts/listings/4663.json` lists 16 Robinhood stock tokens with Chainlink USD feeds
and Uniswap routes: NVDA, TSLA, AAPL, GOOGL, MSFT, AMZN, META, COIN, ORCL, PLTR, CRWV,
AMD, INTC, MU, SNDK enabled; **SPCX present but disabled** (private company feed,
review before listing). It also carries the infra addresses (WETH, USDG, SwapRouter02,
QuoterV2, ETH/USD feed) and six non negotiable listing rules (`HANDOFF.md §8`). BE and
USAR have no feed and must never be listed.

Run `forge script script/VerifyUniverse.s.sol --rpc-url robinhood_mainnet` before every
wiring change. It hard fails unless every enabled token's symbol, decimals, feed
freshness and QuoterV2 route check out against the Chainlink price.

Note on `UniswapV3SwapAdapter`: SwapRouter02's `ExactInputSingleParams` has **no
deadline field**. The adapter is written for that struct. It swaps the USDG → token
leg only; the quote comes from the oracle, never from the pool being traded.

## 8. What is real and what is not

| Piece | State at handover |
|---|---|
| Protocol contracts (5) | Built, 83 tests green including fuzz and invariants. Deployed **only to local Anvil (31337)**. |
| Production adapters (`ChainlinkPriceOracle`, `UniswapV3SwapAdapter`) | Written against mainnet 4663 addresses. Unit tested. **Not deployed, not run against a live chain.** |
| `VerifyUniverse.s.sol` | Written. Never run against mainnet from this environment. |
| Robinhood Chain testnet (46630) deployment | **None.** README describes how; no `46630.json` exists. |
| Robinhood Chain mainnet (4663) deployment | **None.** |
| Website | Deployable to Vercel as documented. Everything runs on the demo store until an address book exists. |
| Dividend oracle, settlement keeper, claim keeper | **Not built.** Roles exist; nobody operates them. |
| Audit | **None.** |
| Upgradeability | v1 is immutable, no proxies, by recommendation. Open decision flagged in `HANDOFF.md §8b`. |

The most important fact: **nothing is on Robinhood Chain.** The first real milestone is
a testnet deployment.

## 9. Run it

```bash
# node 22+, pnpm 9+, foundry
pnpm install
pnpm chain                      # anvil, chain id 31337, 2s blocks
pnpm contracts:deploy:local     # deploy, seed 3 dividends (AAPL, KO, MSFT), fund vault, sync ABIs
pnpm dev                        # http://localhost:3000

pnpm contracts:test             # 83 tests
pnpm typecheck                  # sdk + mcp + web
pnpm build                      # sdk, mcp, web
```

Then connect a wallet to `http://127.0.0.1:8545`, import an anvil key, faucet AAPL
from the dashboard, deposit, pick a mode, watch the counter move. There is no ESLint
config; typecheck is the gate.

## 10. What to do next, in order

1. **Deploy to Robinhood Chain testnet (46630).** Fund a deployer at the faucet, run
   `Deploy.s.sol` then `Seed.s.sol` with `--rpc-url robinhood_testnet`, run `pnpm abis`,
   commit `contracts/deployments/46630.json` and the regenerated
   `packages/sdk/src/generated/deployments.ts`, set the five env vars on Vercel. The
   site goes live with no code changes.
2. **Work the testnet → production checklist** (`HANDOFF.md §7`): canonical USDG, real
   stock token addresses, real swap adapter and price oracle, delete `mocks/`.
3. **Run `VerifyUniverse.s.sol` against 4663** and do the live small
   receive/hold/transfer test the listing rules require before any real bankroll.
4. **Harden clawback** (`HANDOFF.md §6`): price seizures from the oracle, handle the
   holder who withdrew before the void, timelock `liquidateCollateral`.
5. **Operations.** Decide who runs `ORACLE_ROLE` (dividend data source), who runs
   `settleDividend` and where the issuer's USDG comes from, and who runs the claim
   keeper. Move every admin role to multisig + timelock.
6. **Audit** against the checklist in `HANDOFF.md §11`.
7. **Do not change** anything in `contracts/src/interfaces/` or the event signatures in
   `HANDOFF.md §10`. The SDK, MCP server and web app depend on them. Additive only.

## 11. Where to look when something is unclear

- Contract architecture, roles, trust model, checklists: `HANDOFF.md`
- Commands, env vars, Vercel: `README.md`
- Network knowledge: `apps/web/src/lib/chain.config.ts`, `packages/sdk/src/chains.ts`,
  `contracts/foundry.toml` `[rpc_endpoints]`
- Demo data shape and every UI type: `apps/web/src/lib/data/types.ts`, `mock.ts`
- Mainnet token table: `contracts/listings/4663.json`
