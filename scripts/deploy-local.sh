#!/usr/bin/env bash
# Deploy and seed the protocol on a local anvil. Kept as the name every existing
# doc and script points at; the work happens in deploy.sh, which does the same
# job for a real chain.
set -euo pipefail
exec bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/deploy.sh" local "$@"
