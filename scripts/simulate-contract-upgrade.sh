#!/usr/bin/env bash
# simulate-contract-upgrade.sh — Local contract upgrade simulation.
#
# Validates that the amana_escrow contract can be safely upgraded by:
#   1. Verifying the contract compiles cleanly.
#   2. Running all upgrade compatibility tests (upgrade_tests.rs).
#   3. Running storage golden tests (storage_golden_tests.rs).
#   4. Running auth matrix tests (auth_matrix_tests.rs).
#   5. Running admin clawback access-control tests if present.
#   6. Running the deployment safety pre-flight checks.
#   7. Printing a pass/fail summary.
#
# Usage:
#   ./scripts/simulate-contract-upgrade.sh [--skip-build] [--verbose]
#
# Options:
#   --skip-build   Skip the cargo build step (useful if you just built).
#   --verbose      Stream cargo test output to stdout instead of buffering it.
#
# Exit codes:
#   0 — all checks passed; safe to proceed with upgrade.
#   1 — one or more checks failed; do NOT upgrade until issues are resolved.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
CONTRACT_DIR="$REPO_ROOT/contracts/amana_escrow"

SKIP_BUILD=false
VERBOSE=false

for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=true ;;
    --verbose)    VERBOSE=true ;;
  esac
done

# ── Colour helpers ─────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

PASS="${GREEN}✓ PASS${RESET}"
FAIL="${RED}✗ FAIL${RESET}"
SKIP="${YELLOW}⊘ SKIP${RESET}"

# ── Tracking ───────────────────────────────────────────────────────────────────
CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_SKIPPED=0
declare -a FAILED_CHECKS=()

record_pass() { CHECKS_PASSED=$((CHECKS_PASSED + 1)); }
record_fail() { CHECKS_FAILED=$((CHECKS_FAILED + 1)); FAILED_CHECKS+=("$1"); }
record_skip() { CHECKS_SKIPPED=$((CHECKS_SKIPPED + 1)); }

# ── Run helper ─────────────────────────────────────────────────────────────────
# run_check "label" command [args...]
# Returns 0 on success, 1 on failure. Never exits the script directly.
run_check() {
  local label="$1"
  shift
  printf "  %-55s " "$label"

  local output
  local exit_code=0

  if [[ "$VERBOSE" == "true" ]]; then
    echo ""
    "$@" || exit_code=$?
  else
    output=$("$@" 2>&1) || exit_code=$?
  fi

  if [[ $exit_code -eq 0 ]]; then
    echo -e "$PASS"
    record_pass
  else
    echo -e "$FAIL"
    if [[ "$VERBOSE" != "true" && -n "${output:-}" ]]; then
      echo -e "${RED}--- output ---${RESET}"
      echo "$output" | tail -40
      echo -e "${RED}--------------${RESET}"
    fi
    record_fail "$label"
  fi

  return $exit_code
}

# ── Banner ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}${CYAN}  Amana Escrow — Contract Upgrade Simulation${RESET}"
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${RESET}"
echo ""
echo -e "  Contract: ${CYAN}$CONTRACT_DIR${RESET}"
echo ""

# ── Guard: contract directory must exist ──────────────────────────────────────
if [[ ! -d "$CONTRACT_DIR" ]]; then
  echo -e "${RED}ERROR: contract directory not found: $CONTRACT_DIR${RESET}" >&2
  exit 1
fi

# ── Step 0: Detect available tools ────────────────────────────────────────────
echo -e "${BOLD}Step 0 — Environment checks${RESET}"

if ! command -v cargo &>/dev/null; then
  echo -e "  ${RED}ERROR: cargo not found. Install Rust/Cargo before running this script.${RESET}" >&2
  exit 1
fi
echo -e "  ${GREEN}cargo found: $(cargo --version)${RESET}"

WASM_TARGET_AVAILABLE=false
if rustup target list --installed 2>/dev/null | grep -q 'wasm32-unknown-unknown'; then
  WASM_TARGET_AVAILABLE=true
  echo -e "  ${GREEN}wasm32-unknown-unknown target installed${RESET}"
else
  echo -e "  ${YELLOW}wasm32-unknown-unknown target not installed — WASM build check will be skipped${RESET}"
fi
echo ""

# ── Step 1: Native test build ─────────────────────────────────────────────────
echo -e "${BOLD}Step 1 — Build (native test profile)${RESET}"

if [[ "$SKIP_BUILD" == "true" ]]; then
  echo -e "  ${SKIP} (--skip-build passed)"
  record_skip "Native build"
else
  run_check "cargo check (native)" \
    cargo check --manifest-path "$CONTRACT_DIR/Cargo.toml" 2>&1 || true
fi
echo ""

# ── Step 2: WASM build ────────────────────────────────────────────────────────
echo -e "${BOLD}Step 2 — WASM build${RESET}"

if [[ "$SKIP_BUILD" == "true" ]]; then
  echo -e "  ${SKIP} (--skip-build passed)"
  record_skip "WASM build"
elif [[ "$WASM_TARGET_AVAILABLE" == "false" ]]; then
  echo -e "  ${SKIP} (wasm32 target not installed)"
  record_skip "WASM build"
else
  run_check "cargo build --release --features wasm" \
    cargo build \
      --manifest-path "$CONTRACT_DIR/Cargo.toml" \
      --target wasm32-unknown-unknown \
      --release \
      --features wasm 2>&1 || true
fi
echo ""

# ── Step 3: Upgrade compatibility tests ───────────────────────────────────────
echo -e "${BOLD}Step 3 — Upgrade compatibility tests${RESET}"

UPGRADE_TESTS_FILE="$CONTRACT_DIR/tests/upgrade_tests.rs"
if [[ ! -f "$UPGRADE_TESTS_FILE" ]]; then
  echo -e "  ${FAIL} tests/upgrade_tests.rs not found — this file is required"
  record_fail "upgrade_tests.rs exists"
else
  (
    cd "$CONTRACT_DIR"
    if [[ "$VERBOSE" == "true" ]]; then
      run_check "cargo test --test upgrade_tests" \
        cargo test --test upgrade_tests -- --nocapture
    else
      run_check "cargo test --test upgrade_tests" \
        cargo test --test upgrade_tests
    fi
  ) || true
fi
echo ""

# ── Step 4: Storage golden tests ──────────────────────────────────────────────
echo -e "${BOLD}Step 4 — Storage golden tests${RESET}"

GOLDEN_TESTS_FILE="$CONTRACT_DIR/tests/storage_golden_tests.rs"
if [[ ! -f "$GOLDEN_TESTS_FILE" ]]; then
  echo -e "  ${FAIL} tests/storage_golden_tests.rs not found"
  record_fail "storage_golden_tests.rs exists"
else
  (
    cd "$CONTRACT_DIR"
    run_check "cargo test --test storage_golden_tests" \
      cargo test --test storage_golden_tests
  ) || true
fi
echo ""

# ── Step 5: Auth matrix tests ─────────────────────────────────────────────────
echo -e "${BOLD}Step 5 — Auth matrix tests${RESET}"

AUTH_TESTS_FILE="$CONTRACT_DIR/tests/auth_matrix_tests.rs"
if [[ ! -f "$AUTH_TESTS_FILE" ]]; then
  echo -e "  ${FAIL} tests/auth_matrix_tests.rs not found"
  record_fail "auth_matrix_tests.rs exists"
else
  (
    cd "$CONTRACT_DIR"
    run_check "cargo test --test auth_matrix_tests" \
      cargo test --test auth_matrix_tests
  ) || true
fi
echo ""

# ── Step 6: Admin clawback tests (conditional) ────────────────────────────────
echo -e "${BOLD}Step 6 — Admin clawback tests (if present)${RESET}"

CLAWBACK_AC_FILE="$CONTRACT_DIR/tests/clawback_access_control_tests.rs"
CLAWBACK_INV_FILE="$CONTRACT_DIR/tests/clawback_invariant_tests.rs"

if [[ ! -f "$CLAWBACK_AC_FILE" && ! -f "$CLAWBACK_INV_FILE" ]]; then
  echo -e "  ${SKIP} clawback test files not found (not yet introduced)"
  record_skip "clawback tests"
else
  if [[ -f "$CLAWBACK_AC_FILE" ]]; then
    (
      cd "$CONTRACT_DIR"
      run_check "cargo test --test clawback_access_control_tests" \
        cargo test --test clawback_access_control_tests
    ) || true
  fi
  if [[ -f "$CLAWBACK_INV_FILE" ]]; then
    (
      cd "$CONTRACT_DIR"
      run_check "cargo test --test clawback_invariant_tests" \
        cargo test --test clawback_invariant_tests
    ) || true
  fi
fi
echo ""

# ── Step 7: Deployment safety checks ─────────────────────────────────────────
echo -e "${BOLD}Step 7 — Deployment safety pre-flight${RESET}"

SAFETY_SCRIPT_REPO="$REPO_ROOT/scripts/check-contract-deployment-safety.sh"
SAFETY_SCRIPT_CONTRACT="$REPO_ROOT/contracts/check-contract-deployment-safety.sh"

if [[ -f "$SAFETY_SCRIPT_REPO" ]]; then
  run_check "check-contract-deployment-safety.sh" \
    bash "$SAFETY_SCRIPT_REPO" || true
elif [[ -f "$SAFETY_SCRIPT_CONTRACT" ]]; then
  run_check "check-contract-deployment-safety.sh (contracts/)" \
    bash "$SAFETY_SCRIPT_CONTRACT" || true
else
  echo -e "  ${SKIP} check-contract-deployment-safety.sh not found"
  record_skip "deployment safety script"
fi
echo ""

# ── Step 8: Schema version sanity ────────────────────────────────────────────
echo -e "${BOLD}Step 8 — Schema version sanity check${RESET}"

LIB_RS="$CONTRACT_DIR/src/lib.rs"
if [[ ! -f "$LIB_RS" ]]; then
  echo -e "  ${FAIL} src/lib.rs not found"
  record_fail "lib.rs exists"
else
  if grep -qE 'CURRENT_SCHEMA_VERSION\s*[:=]\s*[0-9]+' "$LIB_RS"; then
    SCHEMA_VER=$(grep -oE 'CURRENT_SCHEMA_VERSION\s*[=:]\s*[0-9]+' "$LIB_RS" | grep -oE '[0-9]+$' | head -1)
    echo -e "  ${GREEN}CURRENT_SCHEMA_VERSION = $SCHEMA_VER${RESET}"
    record_pass
    CHECKS_PASSED=$((CHECKS_PASSED - 1)) # will be re-counted below
    run_check "CURRENT_SCHEMA_VERSION defined in lib.rs" \
      grep -qE 'CURRENT_SCHEMA_VERSION' "$LIB_RS" || true
  else
    echo -e "  ${FAIL} CURRENT_SCHEMA_VERSION not found in src/lib.rs"
    record_fail "CURRENT_SCHEMA_VERSION in lib.rs"
  fi
fi
echo ""

# ── Step 9: Event topic symbols ───────────────────────────────────────────────
echo -e "${BOLD}Step 9 — Event topic symbols${RESET}"

EXPECTED_SYMBOLS=("TRDCRT" "TRDFND" "TRDCAN" "DELCNF" "RELSD" "DISINI" "DISRES" "ADMCLW" "UPGRAD")
SYMBOLS_OK=true

for sym in "${EXPECTED_SYMBOLS[@]}"; do
  if grep -qr "\"$sym\"" "$CONTRACT_DIR/src/" 2>/dev/null || \
     grep -qr "symbol_short\!(\"$sym\"" "$CONTRACT_DIR/src/" 2>/dev/null || \
     grep -qr "$sym" "$CONTRACT_DIR/src/" 2>/dev/null; then
    printf "  %-55s %b\n" "symbol $sym present" "$PASS"
    record_pass
  else
    printf "  %-55s %b\n" "symbol $sym present" "${YELLOW}⊘ WARN (not found — may not apply yet)${RESET}"
    record_skip "symbol $sym"
  fi
done
echo ""

# ── Summary ───────────────────────────────────────────────────────────────────
TOTAL=$((CHECKS_PASSED + CHECKS_FAILED + CHECKS_SKIPPED))

echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${RESET}"
echo -e "${BOLD}  Upgrade Simulation Summary${RESET}"
echo -e "${BOLD}${CYAN}═══════════════════════════════════════════════════════════════${RESET}"
echo ""
echo -e "  Total checks : $TOTAL"
echo -e "  ${GREEN}Passed       : $CHECKS_PASSED${RESET}"
echo -e "  ${YELLOW}Skipped      : $CHECKS_SKIPPED${RESET}"
echo -e "  ${RED}Failed       : $CHECKS_FAILED${RESET}"
echo ""

if [[ $CHECKS_FAILED -gt 0 ]]; then
  echo -e "${RED}${BOLD}  ✗ UPGRADE SIMULATION FAILED${RESET}"
  echo ""
  echo -e "  The following checks failed:"
  for check in "${FAILED_CHECKS[@]}"; do
    echo -e "    ${RED}• $check${RESET}"
  done
  echo ""
  echo -e "  Resolve all failures before proceeding with the upgrade."
  echo -e "  See ${CYAN}contracts/amana_escrow/docs/safe-upgrade-guide.md${RESET} for guidance."
  echo ""
  exit 1
else
  echo -e "${GREEN}${BOLD}  ✓ UPGRADE SIMULATION PASSED — safe to proceed${RESET}"
  echo ""
  echo -e "  Next steps:"
  echo -e "  1. Build the release WASM:"
  echo -e "     ${CYAN}cd contracts/amana_escrow && cargo build --target wasm32-unknown-unknown --release --features wasm${RESET}"
  echo -e "  2. Upload WASM and capture the hash:"
  echo -e "     ${CYAN}stellar contract upload --network testnet --source <ADMIN> --wasm <WASM_PATH>${RESET}"
  echo -e "  3. Invoke upgrade on the live contract:"
  echo -e "     ${CYAN}stellar contract invoke ... -- upgrade --new_wasm_hash <HASH>${RESET}"
  echo -e "  4. See full procedure: ${CYAN}contracts/amana_escrow/docs/safe-upgrade-guide.md${RESET}"
  echo ""
  exit 0
fi
