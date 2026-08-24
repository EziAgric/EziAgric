#!/bin/bash
#
# Issue #193: Contract upgrade deployment safety verification script
#
# Verifies that a queued contract upgrade matches the public source code before execution.
# Usage: ./check-contract-deployment-safety.sh <operation_id> [expected_hash]
#
# This script ensures:
# 1. The WASM binary has been publicly verified (hash reproducible from source)
# 2. The hash matches what the contract has queued for upgrade
# 3. Community can audit the source before execution
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPERATION_ID="${1:-}"
EXPECTED_HASH="${2:-}"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helpers
log_info() { echo -e "${GREEN}ℹ${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }
log_ok() { echo -e "${GREEN}✓${NC} $1"; }

# Usage
if [ -z "$OPERATION_ID" ]; then
  echo "Usage: $0 <operation_id> [expected_hash]"
  echo ""
  echo "Example:"
  echo "  $0 42"
  echo "  $0 42 0xabcd1234..."
  echo ""
  echo "Before running this script:"
  echo "  1. Get the queued operation from ContractUpgradeQueued event"
  echo "  2. Extract the new_wasm_hash from the event"
  echo "  3. Run this script to verify it matches source"
  exit 1
fi

log_info "Contract deployment safety check (Issue #193)"
log_info "Operation ID: $OPERATION_ID"
echo ""

# Step 1: Rebuild the contract
log_info "Step 1/3: Rebuilding contract from source..."

cd "$SCRIPT_DIR"
if ! cargo build --target wasm32-unknown-unknown --release 2>&1 | grep -q "Finished"; then
  log_error "Failed to build contract"
  exit 1
fi

log_ok "Contract built successfully"
echo ""

# Step 2: Calculate hash of rebuilt binary
log_info "Step 2/3: Computing WASM hash..."

WASM_PATH="target/wasm32-unknown-unknown/release/amana_escrow.wasm"

if [ ! -f "$WASM_PATH" ]; then
  log_error "WASM binary not found at $WASM_PATH"
  exit 1
fi

COMPUTED_HASH=$(sha256sum "$WASM_PATH" | cut -d' ' -f1)
log_ok "Computed hash: $COMPUTED_HASH"
echo ""

# Step 3: Verify against expected hash
log_info "Step 3/3: Verifying against queued operation..."

if [ -n "$EXPECTED_HASH" ]; then
  # Normalize hash format (remove 0x prefix if present)
  EXPECTED_HASH=$(echo "$EXPECTED_HASH" | sed 's/^0x//')

  if [ "$COMPUTED_HASH" = "$EXPECTED_HASH" ]; then
    log_ok "Hash VERIFIED ✓"
    echo ""
    echo "════════════════════════════════════════════════════════════════════"
    echo "  DEPLOYMENT SAFETY CHECK PASSED"
    echo "════════════════════════════════════════════════════════════════════"
    echo ""
    echo "Actions:"
    echo "  1. Review the source code changes (git diff)"
    echo "  2. Verify the contract functionality on testnet"
    echo "  3. Get community approval"
    echo "  4. Wait for timelock delay to elapse"
    echo "  5. Call execute_upgrade($OPERATION_ID) when ready"
    echo ""
    exit 0
  else
    log_error "Hash MISMATCH ✗"
    echo ""
    echo "Expected: $EXPECTED_HASH"
    echo "Computed: $COMPUTED_HASH"
    echo ""
    log_warn "DO NOT EXECUTE THIS UPGRADE"
    log_warn "The queued hash does not match the public source code"
    echo ""
    exit 1
  fi
else
  log_warn "No expected hash provided (use with caution)"
  echo ""
  echo "Computed WASM hash:"
  echo "  $COMPUTED_HASH"
  echo ""
  echo "Compare this hash against the queued operation:"
  echo "  1. Query the pending upgrade via RPC"
  echo "  2. Extract new_wasm_hash from ContractUpgradeQueued event"
  echo "  3. Re-run: $0 $OPERATION_ID <hash>"
  echo ""
  exit 0
fi
