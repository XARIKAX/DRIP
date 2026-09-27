#!/usr/bin/env bash
# Prepare Blockscout verification input for the Stack contracts.
#
# Same situation as verify-mainnet.sh and for the same reason: the explorer sits
# behind a Cloudflare challenge that a browser passes and a CLI cannot, so this writes
# the standard JSON input and prints what to paste rather than calling the verifier.
# See verify-mainnet.sh for the full account of why.
#
#   VAULT=0x... SHARE=0x... DEPLOYER=0x... ./script/verify-stack.sh
#
# VAULT is the StackVault the deploy printed. SHARE is the share token of the basket
# it created, printed on the "share token:" line. DEPLOYER is the address that ran the
# deploy — StackVault's constructor takes it, not the admin, because the deployer holds
# CREATOR_ROLE for the length of the run and hands over at the end. Verifying against
# the admin produces a bytecode mismatch that reads like a compiler problem.
set -euo pipefail

: "${VAULT:?VAULT is required: the StackVault address the deploy printed}"
: "${SHARE:?SHARE is required: the share token address, from the deploy log}"
: "${DEPLOYER:?DEPLOYER is required: the StackVault constructor arg, not the admin}"

# forge resolves the whole [etherscan] table before doing anything, including an entry
# this command never touches. The variable only has to exist.
export ARBISCAN_API_KEY="${ARBISCAN_API_KEY:-unused}"

OUT="${OUT:-./verify}"
mkdir -p "$OUT"

forge verify-contract "$VAULT" src/StackVault.sol:StackVault \
  --show-standard-json-input > "$OUT/StackVault.json"
forge verify-contract "$SHARE" src/StackToken.sol:StackToken \
  --show-standard-json-input > "$OUT/StackToken.json"

# The share token's name and symbol come off the chain rather than out of the recipe
# file: the recipe says what was asked for, the chain says what was built, and the
# verifier needs the second. RPC_URL is only used for this, and the constructor line
# is left for you to fill in if it is not set.
NAME=""
SYMBOL=""
if [ -n "${RPC_URL:-}" ]; then
  NAME="$(cast call "$SHARE" 'name()(string)' --rpc-url "$RPC_URL")"
  SYMBOL="$(cast call "$SHARE" 'symbol()(string)' --rpc-url "$RPC_URL")"
fi

VAULT_ARGS="$(cast abi-encode 'constructor(address)' "$DEPLOYER")"
if [ -n "$NAME" ]; then
  # cast prints strings quoted; strip the quotes before re-encoding them.
  SHARE_ARGS="$(cast abi-encode 'constructor(string,string)' "${NAME//\"/}" "${SYMBOL//\"/}")"
else
  SHARE_ARGS="(set RPC_URL to have this computed, or encode constructor(string,string) yourself)"
fi

cat <<EOF

Wrote $OUT/StackVault.json and $OUT/StackToken.json

On https://robinhoodchain.blockscout.com, open each contract, then
Verify & Publish -> Solidity (Standard JSON Input):

  StackVault  $VAULT
    file         $OUT/StackVault.json
    compiler     v0.8.28
    constructor  $VAULT_ARGS

  StackToken  $SHARE
    file         $OUT/StackToken.json
    compiler     v0.8.28
    constructor  $SHARE_ARGS

StackVault's constructor arg is the DEPLOYER. The vault was built with the deployer
holding CREATOR_ROLE so it could open the baskets, then handed to the admin and
renounced. Verifying against the admin will not match.

StackToken takes no vault argument — it reads msg.sender at construction — so its only
constructor args are the name and symbol, and every basket's share token verifies with
the same standard JSON and a different pair of strings.
EOF
