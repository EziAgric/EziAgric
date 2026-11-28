#!/usr/bin/env bash
# Regenerate the Soroban contract ABI (interface) snapshot.
#
# Usage:
#   ./scripts/update-abi-snapshot.sh            # writes contracts/snapshots/amana_escrow.abi.json
#   ./scripts/update-abi-snapshot.sh <out.json> # writes to a custom path (used by CI)
#
# Requires: cargo with the wasm32-unknown-unknown target, jq, and stellar-cli
#   rustup target add wasm32-unknown-unknown
#   cargo install --locked stellar-cli
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRATE_DIR="$REPO_ROOT/contracts/amana_escrow"
CRATE_NAME="amana_escrow"
OUT="${1:-$REPO_ROOT/contracts/snapshots/$CRATE_NAME.abi.json}"

for bin in cargo jq stellar; do
  command -v "$bin" >/dev/null 2>&1 || { echo "error: '$bin' is required but not installed" >&2; exit 1; }
done

echo "Building $CRATE_NAME WASM..."
(cd "$CRATE_DIR" && cargo build --locked --target wasm32-unknown-unknown --features wasm --release)

TARGET_DIR="$(cd "$CRATE_DIR" && cargo metadata --format-version 1 --no-deps | jq -r .target_directory)"
WASM="$TARGET_DIR/wasm32-unknown-unknown/release/$CRATE_NAME.wasm"
[ -f "$WASM" ] || { echo "error: WASM not found at $WASM" >&2; exit 1; }

mkdir -p "$(dirname "$OUT")"

# Sort keys so the snapshot is stable and diffs stay readable.
stellar contract info interface --wasm "$WASM" --output json \
  | jq --sort-keys . > "$OUT"

echo "ABI written to $OUT"
