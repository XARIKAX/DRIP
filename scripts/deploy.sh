#!/usr/bin/env bash
# One shot: compile, deploy, seed, and wire the result into the frontend.
#
#   bash scripts/deploy.sh                                  # local anvil
#   PRIVATE_KEY=0x... bash scripts/deploy.sh robinhood_testnet
#   PRIVATE_KEY=0x... RPC_URL=https://... bash scripts/deploy.sh
#
# Everything downstream reads contracts/deployments/<chainid>.json. This script
# writes it, copies it into the SDK, and points apps/web at the chain it just used,
# so `pnpm dev` comes up live with no further edits.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Anvil's default first account. Testnet only, worth nothing, published everywhere.
ANVIL_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

# Network alias => RPC URL and the explorer metadata the frontend needs. Keep in
# step with contracts/foundry.toml [rpc_endpoints] and apps/web/.env.example.
network="${1:-local}"
case "$network" in
  local)
    default_rpc="http://127.0.0.1:8545"
    chain_label="Anvil"
    explorer_name="Local"
    explorer_url="http://localhost"
    ;;
  robinhood_testnet)
    default_rpc="https://rpc.testnet.chain.robinhood.com/rpc"
    chain_label="Robinhood Chain Testnet"
    explorer_name="Robinhood Chain Explorer"
    explorer_url="https://explorer.testnet.chain.robinhood.com"
    ;;
  robinhood_mainnet)
    default_rpc="https://rpc.mainnet.chain.robinhood.com"
    chain_label="Robinhood Chain"
    explorer_name="Blockscout"
    explorer_url="https://robinhoodchain.blockscout.com"
    ;;
  arbitrum_sepolia)
    default_rpc="${ARBITRUM_SEPOLIA_RPC_URL:-https://sepolia-rollup.arbitrum.io/rpc}"
    chain_label="Arbitrum Sepolia"
    explorer_name="Arbiscan"
    explorer_url="https://sepolia.arbiscan.io"
    ;;
  *)
    echo "Unknown network '$network'." >&2
    echo "Use: local | robinhood_testnet | robinhood_mainnet | arbitrum_sepolia" >&2
    echo "Or set RPC_URL and pass no argument." >&2
    exit 1
    ;;
esac

RPC_URL="${RPC_URL:-$default_rpc}"
SEED="${SEED:-1}"

# ---------------------------------------------------------------------------
# Preflight. Every failure here is cheaper than a half-deployed address book.
# ---------------------------------------------------------------------------
for bin in forge cast node; do
  command -v "$bin" >/dev/null 2>&1 || { echo "Missing '$bin' on PATH." >&2; exit 1; }
done

# forge-std and openzeppelin are submodules. Without them `forge build` fails with
# "Source not found", which reads like a broken repo rather than an unfinished clone.
if [ ! -f "$ROOT/contracts/lib/forge-std/src/Script.sol" ]; then
  echo "Contract dependencies are missing (git submodules)." >&2
  echo "Run: git submodule update --init --recursive" >&2
  exit 1
fi

# The documented local flow starts anvil in one terminal and runs this in the next,
# so give the chain a moment to come up. A rate limited public RPC can flake on a
# first call too; both are worth a retry, neither is worth a long stall.
echo "==> Chain at $RPC_URL"
CHAIN_ID=""
for _ in $(seq 1 30); do
  CHAIN_ID="$(cast chain-id --rpc-url "$RPC_URL" 2>/dev/null || true)"
  [ -n "$CHAIN_ID" ] && break
  sleep 1
done
if [ -z "$CHAIN_ID" ]; then
  echo "No chain answered at $RPC_URL." >&2
  if [ "$network" = "local" ]; then echo "Start one with: pnpm chain" >&2; fi
  exit 1
fi

if [ "$network" = "local" ] || [ "$CHAIN_ID" = "31337" ]; then
  is_local=1
else
  is_local=0
fi

if [ "$is_local" = "1" ]; then
  PRIVATE_KEY="${PRIVATE_KEY:-$ANVIL_KEY}"
elif [ -z "${PRIVATE_KEY:-}" ]; then
  echo "PRIVATE_KEY is required to deploy to chain $CHAIN_ID." >&2
  exit 1
fi

DEPLOYER="$(cast wallet address --private-key "$PRIVATE_KEY")"
BALANCE="$(cast balance "$DEPLOYER" --rpc-url "$RPC_URL")"
echo "    chain id $CHAIN_ID · deployer $DEPLOYER · $(cast to-unit "$BALANCE" ether) ETH"

if [ "$BALANCE" = "0" ]; then
  echo "Deployer has no gas on chain $CHAIN_ID." >&2
  if [ "$CHAIN_ID" = "46630" ]; then echo "Faucet: https://faucet.testnet.chain.robinhood.com" >&2; fi
  exit 1
fi

# Which of the two deploy scripts runs. Deploy.s.sol makes a testnet feel alive and
# deploys MockUSDG, five faucet-minting MockStockTokens and a fixed price venue to do
# it — none of which belongs on a chain carrying money. DeployProduction.s.sol takes
# every address from listings/<chainid>.json instead and hands all roles to ADMIN.
if [ -n "${PRODUCTION:-}" ]; then
  script="DeployProduction.s.sol"
  SEED=0
  if [ -z "${ADMIN:-}" ]; then
    echo "PRODUCTION needs ADMIN: the multisig that receives every role." >&2
    echo "The deployer keeps nothing; the script asserts that before it finishes." >&2
    exit 1
  fi
  if [ ! -f "$ROOT/contracts/listings/$CHAIN_ID.json" ]; then
    echo "No listing universe at contracts/listings/$CHAIN_ID.json." >&2
    echo "A production deploy takes every token, feed and route from that file." >&2
    exit 1
  fi
  echo "    production: real assets from listings/$CHAIN_ID.json, roles to $ADMIN"
else
  script="Deploy.s.sol"
  # A testnet-only script reaching a chain that carries money is an incident, and
  # making mainnet a one word argument removed the speed bump that used to prevent it.
  case "$CHAIN_ID" in
    31337|46630|421614) ;;
    *)
      if [ -z "${DEPLOY_MOCKS_TO_MAINNET:-}" ]; then
        echo "Refusing to deploy to chain $CHAIN_ID." >&2
        echo "Deploy.s.sol deploys mock USDG and mock stock tokens; they belong on a" >&2
        echo "testnet only. For a real deploy against this chain's own assets:" >&2
        echo "  ADMIN=0xmultisig PRODUCTION=1 pnpm deploy:chain $network" >&2
        echo "To deploy the mocks anyway: DEPLOY_MOCKS_TO_MAINNET=1" >&2
        exit 1
      fi
      echo "    WARNING: deploying testnet mocks to chain $CHAIN_ID on request"
      ;;
  esac
fi

# A live chain cannot be time-warped, so the first dividend has to be declared far
# enough ahead that it survives the gap between simulation and inclusion.
if [ -z "${SEED_EX_LEAD:-}" ]; then
  if [ "$is_local" = "1" ]; then SEED_EX_LEAD=60; else SEED_EX_LEAD=900; fi
fi

# Simulation catches a revert before it costs gas, and --slow keeps nonces in order
# on a rate limited public RPC. Neither is worth the wall clock on anvil — but a
# production deploy gets both regardless of the chain it is pointed at.
if [ "$is_local" = "1" ] && [ -z "${PRODUCTION:-}" ]; then
  forge_flags=(--skip-simulation -q)
else
  forge_flags=(--slow)
fi
if [ -n "${VERIFY:-}" ]; then
  forge_flags+=(--verify --verifier blockscout --verifier-url "${VERIFIER_URL:-$explorer_url/api}")
fi

cd "$ROOT/contracts"

echo "==> Compiling"
forge build -q

if [ -n "${PRODUCTION:-}" ]; then
  echo "==> Verifying the listing universe onchain"
  forge script script/VerifyUniverse.s.sol --rpc-url "$RPC_URL"
fi

echo "==> Deploying protocol ($script)"
PRIVATE_KEY="$PRIVATE_KEY" ADMIN="${ADMIN:-}" forge script "script/$script" \
  --rpc-url "$RPC_URL" --broadcast "${forge_flags[@]}"

if [ "$SEED" = "1" ]; then
  echo "==> Seeding vault, balances and calendar (first ex date in ${SEED_EX_LEAD}s)"
  PRIVATE_KEY="$PRIVATE_KEY" SEED_EX_LEAD="$SEED_EX_LEAD" forge script script/Seed.s.sol \
    --rpc-url "$RPC_URL" --broadcast "${forge_flags[@]}"

  if [ "$is_local" = "1" ]; then
    echo "==> Fast forwarding past the first ex date"
    cast rpc evm_increaseTime $((SEED_EX_LEAD + 60)) --rpc-url "$RPC_URL" >/dev/null
    cast rpc evm_mine --rpc-url "$RPC_URL" >/dev/null
  fi
fi

# Operational steps. Each is optional, each needs something only the operator has:
# USDG in a wallet, and a corporate action file that reflects reality.
if [ -n "${FUND:-}" ]; then
  echo "==> Funding the pool with $FUND USDG"
  AMOUNT="$FUND" PRIVATE_KEY="$PRIVATE_KEY" forge script script/FundPool.s.sol \
    --rpc-url "$RPC_URL" --broadcast "${forge_flags[@]}"
fi

if [ -n "${DECLARE:-}" ]; then
  if [ ! -f "$ROOT/contracts/dividends/$CHAIN_ID.json" ]; then
    echo "DECLARE needs contracts/dividends/$CHAIN_ID.json." >&2
    echo "It has to be built from real issuer corporate action data — see that" >&2
    echo "directory's README. Nothing in this repo can produce it for you." >&2
    exit 1
  fi
  echo "==> Declaring dividends from dividends/$CHAIN_ID.json"
  PRIVATE_KEY="$PRIVATE_KEY" forge script script/DeclareDividends.s.sol \
    --rpc-url "$RPC_URL" --broadcast "${forge_flags[@]}"
fi

echo "==> Syncing ABIs and addresses into the SDK"
node "$ROOT/scripts/sync-abis.mjs"

# ---------------------------------------------------------------------------
# The wire-in. The address book alone makes the SDK aware of the chain; these five
# vars are what make the app talk to it.
# ---------------------------------------------------------------------------
ENV_FILE="$ROOT/apps/web/.env.local"
echo "==> Pointing apps/web at chain $CHAIN_ID"
{
  echo "# Written by scripts/deploy.sh. Regenerated on every deploy."
  echo "NEXT_PUBLIC_CHAIN_ID=$CHAIN_ID"
  echo "NEXT_PUBLIC_CHAIN_NAME=$chain_label"
  echo "NEXT_PUBLIC_RPC_URL=$RPC_URL"
  echo "NEXT_PUBLIC_EXPLORER_NAME=$explorer_name"
  echo "NEXT_PUBLIC_EXPLORER_URL=$explorer_url"
  if [ -n "${NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID:-}" ]; then
    echo "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=$NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID"
  fi
} > "$ENV_FILE"

cat <<EOF

Done. Chain $CHAIN_ID is live and the app is pointed at it.

  contracts/deployments/$CHAIN_ID.json        the address book
  packages/sdk/src/generated/deployments.ts   the copy every package imports
  apps/web/.env.local                         the five vars the app reads

Next:
  pnpm dev                     http://localhost:3000, connect a wallet on chain $CHAIN_ID

Operational steps this does not do, because none of them is code:
  the dividend oracle    contracts/dividends/$CHAIN_ID.json, from real corporate
                         action data, then DECLARE=1 or DeclareDividends.s.sol
  the pay-day keeper     SettleDividends.s.sol, run when issuers pay; the keeper
                         wallet needs the USDG to settle with
  pool capital           FUND=<usdg> or FundPool.s.sol; the USDG has to exist first

To ship it, commit the two generated files and set the same five vars in Vercel:
  NEXT_PUBLIC_CHAIN_ID=$CHAIN_ID
  NEXT_PUBLIC_CHAIN_NAME=$chain_label
  NEXT_PUBLIC_RPC_URL=$RPC_URL
  NEXT_PUBLIC_EXPLORER_NAME=$explorer_name
  NEXT_PUBLIC_EXPLORER_URL=$explorer_url
EOF
