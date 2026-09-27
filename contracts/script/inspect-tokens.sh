#!/usr/bin/env bash
# Read what a token actually says about itself, before it goes into a recipe.
#
# Decimals are the reason this exists. A Stack recipe is raw token amounts per share,
# so assuming eighteen for something that uses nine builds a basket that is wrong by a
# factor of a billion — and it would mint and redeem happily, just holding the wrong
# thing. The chain is the only authority on this; a block explorer's display is not.
#
#   RPC_URL=... ./script/inspect-tokens.sh 0xaddr [0xaddr ...]
set -euo pipefail
: "${RPC_URL:?RPC_URL is required}"

printf '%-44s %-10s %-26s %-4s %s\n' "address" "symbol" "name" "dec" "total supply"
for a in "$@"; do
  if [[ "$(cast code "$a" --rpc-url "$RPC_URL")" == "0x" ]]; then
    printf '%-44s %s\n' "$a" "NO CODE AT THIS ADDRESS"
    continue
  fi
  sym=$(cast call "$a" "symbol()(string)" --rpc-url "$RPC_URL" 2>/dev/null | tr -d '"' || echo "?")
  nam=$(cast call "$a" "name()(string)"   --rpc-url "$RPC_URL" 2>/dev/null | tr -d '"' || echo "?")
  dec=$(cast call "$a" "decimals()(uint8)" --rpc-url "$RPC_URL" 2>/dev/null | awk '{print $1}' || echo "?")
  sup=$(cast call "$a" "totalSupply()(uint256)" --rpc-url "$RPC_URL" 2>/dev/null | awk '{print $1}' || echo "?")
  printf '%-44s %-10s %-26s %-4s %s\n' "$a" "$sym" "$nam" "$dec" "$sup"
done
