#!/usr/bin/env bash
# Prepare Blockscout verification input for the mainnet contracts.
#
# This does NOT call the verifier, because on this chain it cannot. The official
# explorer at explorer.mainnet.chain.robinhood.com is a redirect onto
# robinhoodchain.blockscout.com, which sits behind a Cloudflare challenge — and the
# redirect drops the /api path on the way. forge gets an HTML interstitial instead of
# JSON and fails with a deserialization error that looks like a bytecode problem and
# is not one. A browser passes the challenge; a CLI has no way to.
#
# So this writes the standard JSON input for each contract and prints exactly what to
# paste. Standard JSON is the better route anyway: it carries the exact compiler
# settings, bytecode_hash = "none" included, rather than hoping the verifier infers
# them from foundry.toml it cannot see.
#
#   SPLIT=0x... MARKET=0x... DEPLOYER=0x... USDG=0x... ADMIN=0x... ./script/verify-mainnet.sh
set -euo pipefail

: "${SPLIT:?SPLIT is required}"
: "${MARKET:?MARKET is required}"
: "${DEPLOYER:?DEPLOYER is required: the constructor arg of SplitVault, not the admin}"
: "${USDG:?USDG is required}"
: "${ADMIN:?ADMIN is required}"

# forge resolves the whole [etherscan] table in foundry.toml before it does anything,
# including the arbitrum_sepolia entry's ${ARBISCAN_API_KEY} — even though nothing here
# calls Arbiscan and --show-standard-json-input reaches no network at all. The variable
# only has to exist.
export ARBISCAN_API_KEY="${ARBISCAN_API_KEY:-unused}"

OUT="${OUT:-./verify}"
mkdir -p "$OUT"

forge verify-contract "$SPLIT" src/SplitVault.sol:SplitVault \
  --show-standard-json-input > "$OUT/SplitVault.json"
forge verify-contract "$MARKET" src/YieldMarket.sol:YieldMarket \
  --show-standard-json-input > "$OUT/YieldMarket.json"

SPLIT_ARGS="$(cast abi-encode 'constructor(address)' "$DEPLOYER")"
MARKET_ARGS="$(cast abi-encode 'constructor(address,address,address)' "$SPLIT" "$USDG" "$ADMIN")"

cat <<EOF

Wrote $OUT/SplitVault.json and $OUT/YieldMarket.json

On https://robinhoodchain.blockscout.com, open each contract, then
Verify & Publish -> Solidity (Standard JSON Input):

  SplitVault   $SPLIT
    file         $OUT/SplitVault.json
    compiler     v0.8.28
    constructor  $SPLIT_ARGS

  YieldMarket  $MARKET
    file         $OUT/YieldMarket.json
    compiler     v0.8.28
    constructor  $MARKET_ARGS

SplitVault's constructor arg is the DEPLOYER, not the admin. The vault was built
with the deployer holding KEEPER_ROLE and handed over afterwards; verifying against
the admin gives a bytecode mismatch that reads like a much worse problem.

The eleven PrincipalToken and YieldToken pairs were deployed by the vault rather
than by you. Blockscout usually matches those on its own once the vault verifies.
EOF
