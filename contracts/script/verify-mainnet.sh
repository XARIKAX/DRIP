#!/usr/bin/env bash
# Verify the deployed contracts on Robinhood Chain's Blockscout explorer.
#
# Blockscout needs no API key, but it does need the constructor arguments exactly as
# they were passed — including the DEPLOYER for SplitVault, not the admin. The vault
# was constructed with the deployer holding KEEPER_ROLE and handed over afterwards, so
# verifying against the admin address produces a bytecode mismatch and a confusing
# failure.
#
#   SPLIT=0x... MARKET=0x... DEPLOYER=0x... USDG=0x... ADMIN=0x... ./script/verify-mainnet.sh
set -euo pipefail

: "${SPLIT:?SPLIT is required}"
: "${MARKET:?MARKET is required}"
: "${DEPLOYER:?DEPLOYER is required — SplitVault's constructor arg, not the admin}"
: "${USDG:?USDG is required}"
: "${ADMIN:?ADMIN is required}"

VERIFIER_URL="${VERIFIER_URL:-https://robinhoodchain.blockscout.com/api/}"

echo "Verifying SplitVault at $SPLIT"
forge verify-contract "$SPLIT" src/SplitVault.sol:SplitVault \
  --chain-id 4663 \
  --verifier blockscout \
  --verifier-url "$VERIFIER_URL" \
  --constructor-args "$(cast abi-encode 'constructor(address)' "$DEPLOYER")" \
  --watch

echo "Verifying YieldMarket at $MARKET"
forge verify-contract "$MARKET" src/YieldMarket.sol:YieldMarket \
  --chain-id 4663 \
  --verifier blockscout \
  --verifier-url "$VERIFIER_URL" \
  --constructor-args "$(cast abi-encode 'constructor(address,address,address)' "$SPLIT" "$USDG" "$ADMIN")" \
  --watch

echo
echo "The eleven PrincipalToken and YieldToken pairs were deployed BY the vault, not by"
echo "you, so they are not in this list. Blockscout usually matches them automatically"
echo "once SplitVault is verified; if it does not, verify one and it will match the rest."
