#!/usr/bin/env bash
# How old is each price feed, against the 24h bound the oracle enforces?
set -euo pipefail
: "${RPC_URL:?RPC_URL is required}"
NOW=$(cast block latest --rpc-url "$RPC_URL" --field timestamp)
echo "chain time: $NOW"
echo
