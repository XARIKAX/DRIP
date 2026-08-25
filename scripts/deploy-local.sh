#!/usr/bin/env bash
# Deploy and seed the protocol on a local anvil, then fast forward past the first ex date.
# Anvil's default first account. Testnet only, worth nothing, published everywhere.
set -euo pipefail

RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
PRIVATE_KEY="${PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT/contracts"

echo "==> Waiting for a chain at $RPC_URL"
for _ in $(seq 1 30); do
  if cast chain-id --rpc-url "$RPC_URL" >/dev/null 2>&1; then break; fi
  sleep 1
done
cast chain-id --rpc-url "$RPC_URL" >/dev/null

echo "==> Deploying"
PRIVATE_KEY="$PRIVATE_KEY" forge script script/Deploy.s.sol \
  --rpc-url "$RPC_URL" --broadcast --skip-simulation -q

echo "==> Seeding"
PRIVATE_KEY="$PRIVATE_KEY" forge script script/Seed.s.sol \
  --rpc-url "$RPC_URL" --broadcast --skip-simulation -q

echo "==> Fast forwarding past the first ex date"
cast rpc evm_increaseTime 120 --rpc-url "$RPC_URL" >/dev/null
cast rpc evm_mine --rpc-url "$RPC_URL" >/dev/null

echo "==> Syncing ABIs and addresses into the SDK"
node "$ROOT/scripts/sync-abis.mjs"

CHAIN_ID="$(cast chain-id --rpc-url "$RPC_URL")"
echo
echo "Done. Address book: contracts/deployments/${CHAIN_ID}.json"
