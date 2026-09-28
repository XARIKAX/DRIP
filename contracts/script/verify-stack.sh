#!/usr/bin/env bash
# Prepare Blockscout verification input for the Stack contracts.
#
# This does NOT call the verifier, because on this chain it cannot: the explorer sits
# behind a Cloudflare challenge that a browser passes and a CLI has no way to. See
# verify-mainnet.sh for the full account. So it writes the standard JSON input and
# prints exactly what to paste.
#
#   VAULT=0x... SHARE=0x... DEPLOYER=0x... ./script/verify-stack.sh
#
# VAULT is the StackVault. SHARE is the share token of the basket you are verifying,
# printed on the "share token:" line of the deploy. DEPLOYER is StackVault's
# constructor arg, which is the address that FIRST deployed the vault — not the admin,
# and not whoever signed the run that created this basket. Verifying against either of
# those produces a bytecode mismatch that reads like a compiler problem.
#
# Nothing here needs a network. The standard JSON is built from the local build output
# rather than through `forge verify-contract --show-standard-json-input`, which reaches
# binaries.soliditylang.org for the compiler list before it does anything and so fails
# behind a network policy. Set RPC_URL to have the share token's name and symbol read
# off the chain; without it they come from stacks/<chainid>.json, which is what created
# the basket. The script says which one it used.
set -euo pipefail

: "${VAULT:?VAULT is required: the StackVault address}"
: "${SHARE:?SHARE is required: the share token address, from the deploy log}"
: "${DEPLOYER:?DEPLOYER is required: the address that first deployed the vault, not the admin}"

CHAIN_ID="${CHAIN_ID:-4663}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Quiet unless it fails: forge's lint notes go to stderr and bury the one thing this
# script is here to print.
if ! BUILD_LOG="$(forge build --build-info 2>&1)"; then
  echo "$BUILD_LOG" >&2
  exit 1
fi

node ../scripts/standard-json.mjs StackVault StackToken

# The share token's name and symbol. The chain is authoritative — it says what was
# built, where the recipe only says what was asked for — so it wins when reachable.
NAME=""; SYMBOL=""; SOURCE=""
if [ -n "${RPC_URL:-}" ]; then
  NAME="$(cast call "$SHARE" 'name()(string)' --rpc-url "$RPC_URL" | tr -d '"')"
  SYMBOL="$(cast call "$SHARE" 'symbol()(string)' --rpc-url "$RPC_URL" | tr -d '"')"
  SOURCE="read from the chain"
else
  RECIPE="stacks/${CHAIN_ID}.json"
  [ -f "$RECIPE" ] || { echo "No $RECIPE and no RPC_URL; cannot determine the share token's name." >&2; exit 1; }
  # The basket whose symbol this share token carries. With a superseded symbol there
  # may be several entries; the recipe file holds only the current one, which is the
  # one a fresh deploy created.
  NAME="$(node -e "const r=require('./$RECIPE');const s=r.stacks[0];process.stdout.write(s.name)")"
  SYMBOL="$(node -e "const r=require('./$RECIPE');const s=r.stacks[0];process.stdout.write(s.symbol)")"
  SOURCE="from $RECIPE (set RPC_URL to read the chain instead)"
fi

[ -n "$NAME" ] && [ -n "$SYMBOL" ] || { echo "Could not determine the share token's name and symbol." >&2; exit 1; }

VAULT_ARGS="$(cast abi-encode 'constructor(address)' "$DEPLOYER")"
SHARE_ARGS="$(cast abi-encode 'constructor(string,string)' "$NAME" "$SYMBOL")"

cat <<EOF

Share token is "$NAME" ($SYMBOL), $SOURCE.

On https://robinhoodchain.blockscout.com, open each contract, then
Verify & Publish -> Solidity (Standard JSON Input):

  StackVault  $VAULT
    file         contracts/verify/StackVault.json
    compiler     v0.8.28
    constructor  $VAULT_ARGS

  StackToken  $SHARE
    file         contracts/verify/StackToken.json
    compiler     v0.8.28
    constructor  $SHARE_ARGS

Both files carry the optimizer, evm version and bytecodeHash of the build that produced
the deployed bytecode, copied rather than retyped. Leave every field on the Blockscout
form at its default; the JSON already says what the compiler needs to know.

StackToken takes no vault argument — it reads msg.sender at construction — so its only
constructor args are those two strings, and every basket's share token verifies with
the same standard JSON and a different pair.
EOF
