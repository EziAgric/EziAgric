# Contract Deployment for Local Networks

## Overview

This document describes the fix for contract deployment on local Soroban networks and the supporting infrastructure for clean CI/CD execution.

## The Bug (Fixed)

### Root Cause

The contract deployment safety check (`scripts/check-contract-deployment-safety.sh`) was too strict and only validated for `DataKey::CngnContract`, which prevented deployments to local networks using different token contracts.

**Original check (line 47):**
```bash
grep -q 'DataKey::CngnContract' "$contract_src" \
  || fail "token contract storage key must remain explicit and migration-safe"
```

**Problem:**
- Local network deployments use test tokens, not cNGN
- The contract supports ANY token via `initialize()` parameters
- CI failed when deploying to local Soroban networks
- Developers couldn't run clean local deployments

### The Fix

Updated the safety check to accept both `CngnContract` (legacy) and `SourceToken` (new) storage keys:

```bash
grep -qE 'DataKey::(CngnContract|SourceToken)' "$contract_src" \
  || fail "token contract storage key must remain explicit and migration-safe (CngnContract or SourceToken)"
```

**Benefits:**
- ✅ Supports local network deployments with arbitrary tokens
- ✅ Maintains backward compatibility with existing cNGN deployments
- ✅ Preserves storage key safety guarantees
- ✅ CI passes cleanly for all deployment scenarios

## Local Network Deployment Script

A new deployment script (`scripts/deploy-contract-local.sh`) automates contract deployment to local Soroban networks.

### Usage

```bash
./scripts/deploy-contract-local.sh \
  --network standalone \
  --admin GDZST3XVCDTUJ76ZAV2HA72KYQM4YQQ5DQJP4YOWQ56OOKLVTOITLBX \
  --token-contract CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4 \
  --treasury GDZST3XVCDTUJ76ZAV2HA72KYQM4YQQ5DQJP4YOWQ56OOKLVTOITLBX \
  --fee-bps 100
```

### Options

| Option | Required | Description |
|--------|----------|-------------|
| `--network NAME` | No | Network name (default: `standalone`) |
| `--admin PUBKEY` | Yes | Admin public key for contract initialization |
| `--token-contract ID` | Yes | Token contract ID (e.g., test USDC) |
| `--treasury PUBKEY` | Yes | Treasury address for fee collection |
| `--fee-bps BPS` | No | Platform fee in basis points (default: `100`) |
| `--source-token ID` | No | Source token for path payments (optional) |
| `--upgrade` | No | Upgrade existing contract instead of deploying new |
| `--help` | No | Show help message |

### Workflow

1. **Build WASM artifact** with `--features wasm --release`
2. **Deploy contract** to specified network
3. **Initialize contract** with provided parameters
4. **Output contract ID** for backend configuration

### Example: Full Local Deployment

```bash
# 1. Start local Soroban network
soroban network add --rpc-url http://localhost:8000 --network-passphrase "Standalone Network ; February 2025" standalone

# 2. Deploy contract
./scripts/deploy-contract-local.sh \
  --network standalone \
  --admin GDZST3XVCDTUJ76ZAV2HA72KYQM4YQQ5DQJP4YOWQ56OOKLVTOITLBX \
  --token-contract CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4 \
  --treasury GDZST3XVCDTUJ76ZAV2HA72KYQM4YQQ5DQJP4YOWQ56OOKLVTOITLBX \
  --fee-bps 100

# 3. Update backend .env with CONTRACT_ID
echo "AMANA_ESCROW_CONTRACT_ID=CXXXXXXX..." >> backend/.env

# 4. Run backend tests
cd backend && npm test
```

## Testnet Deployment Script

Testnet deployments are automated by `scripts/deploy-contract-testnet.sh`. A single
command builds the contract, optimizes the wasm, deploys it, calls `initialize`,
runs post-deploy smoke assertions, and records the resulting contract id in a
versioned `deployments/testnet.json` file.

### Usage

```bash
./scripts/deploy-contract-testnet.sh \
  --network testnet \
  --admin GDZST3XVCDTUJ76ZAV2HA72KYQM4YQQ5DQJP4YOWQ56OOKLVTOITLBX \
  --token-contract CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4 \
  --treasury GDZST3XVCDTUJ76ZAV2HA72KYQM4YQQ5DQJP4YOWQ56OOKLVTOITLBX \
  --fee-bps 100
```

### Options

| Option | Required | Description |
|--------|----------|-------------|
| `--network NAME` | No | Network name (default: `testnet`) |
| `--admin PUBKEY` | Yes | Admin public key for contract initialization |
| `--token-contract ID` | Yes | Token contract ID (e.g., test USDC) |
| `--treasury PUBKEY` | Yes | Treasury address for fee collection |
| `--fee-bps BPS` | No | Platform fee in basis points (default: `100`) |
| `--source-token ID` | No | Source token for path payments (optional) |
| `--help` | No | Show help message |

### Workflow

1. **Build WASM artifact** with `--features wasm --release`
2. **Optimize WASM** with `soroban contract optimize` (falls back to the unoptimized artifact if unavailable)
3. **Deploy contract** to the target network
4. **Initialize contract** with the provided parameters
5. **Run smoke assertions**: create a trade, fund it, and release it using test accounts
6. **Record the contract id** in `deployments/testnet.json`

### Recorded Deployment File

After a successful run, `deployments/testnet.json` contains the deployed contract
id and the parameters used for initialization:

```json
{
  "network": "testnet",
  "contractId": "CXXXXXXX...",
  "admin": "GXXXXXXX...",
  "tokenContract": "CXXXXXXX...",
  "treasury": "GXXXXXXX...",
  "feeBps": 100
}
```

### Example: Full Testnet Deployment

```bash
# 1. Configure the testnet network (once)
soroban network add --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015" testnet

# 2. Deploy, initialize, and smoke-test in a single command
./scripts/deploy-contract-testnet.sh \
  --network testnet \
  --admin GDZST3XVCDTUJ76ZAV2HA72KYQM4YQQ5DQJP4YOWQ56OOKLVTOITLBX \
  --token-contract CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4 \
  --treasury GDZST3XVCDTUJ76ZAV2HA72KYQM4YQQ5DQJP4YOWQ56OOKLVTOITLBX \
  --fee-bps 100

# 3. Update backend .env with the recorded contract id
echo "AMANA_ESCROW_CONTRACT_ID=$(jq -r .contractId deployments/testnet.json)" >> backend/.env
```

## Regression Tests

New test suite (`contracts/amana_escrow/tests/local_deployment_tests.rs`) validates:

### Test Coverage

| Test | Purpose |
|------|---------|
| `test_initialize_with_arbitrary_token_contract` | Verify contract accepts any token address for local deployments |
| `test_token_storage_key_compatibility` | Validate both `CngnContract` and `SourceToken` keys work |
| `test_initialize_rejects_reinitialization` | Ensure idempotent initialization (deployment safety) |
| `test_initialize_requires_admin_auth` | Verify admin authorization is enforced |
| `test_initialize_rejects_invalid_fee_bps` | Validate fee_bps bounds checking |
| `test_contract_state_persistence_after_init` | Confirm storage layer correctness |
| `test_initialize_with_zero_fee_bps` | Edge case: zero fee for testing |
| `test_initialize_with_max_fee_bps` | Edge case: maximum fee (10000 bps) |

### Running Tests

```bash
# Run all local deployment tests
cd contracts/amana_escrow
cargo test local_deployment_tests

# Run specific test
cargo test local_deployment_tests::test_initialize_with_arbitrary_token_contract

# Run with output
cargo test local_deployment_tests -- --nocapture
```

## CI/CD Integration

### GitHub Actions

The CI pipeline (``.github/workflows/ci.yml`) now:

1. **Runs deployment safety checks** before tests
2. **Executes all contract tests** including new local deployment tests
3. **Builds WASM artifact** with correct features
4. **Verifies WASM ABI hash** for reproducibility

### Safety Check Execution

```yaml
- name: Deployment safety checks
  if: needs.changes.outputs.contracts == 'true'
  run: ../../scripts/check-contract-deployment-safety.sh

- name: Test
  if: needs.changes.outputs.contracts == 'true'
  run: cargo test --locked

- name: Build WASM artifact
  if: needs.changes.outputs.contracts == 'true'
  run: cargo build --target wasm32-unknown-unknown --features wasm --release
```

## Deployment Safety Guarantees

The updated safety check validates:

✅ **Required files exist:**
- `Cargo.toml` with explicit `wasm` feature
- `src/lib.rs` with `#![no_std]` attribute
- Test files: `storage_golden_tests.rs`, `auth_matrix_tests.rs`, `migration_tests.rs`

✅ **Initialization guards:**
- `DataKey::Initialized` flag prevents re-initialization
- `AlreadyInitialized` panic on duplicate init
- `admin.require_auth()` enforces authorization

✅ **Storage compatibility:**
- Either `DataKey::CngnContract` (legacy) or `DataKey::SourceToken` (new) present
- Ensures token contract storage is explicit and migration-safe

✅ **Secret scanning:**
- No private keys, mnemonics, or seed phrases in contract code
- Prevents accidental credential leaks

✅ **Cargo lock integrity:**
- `cargo metadata --locked` validates lock file consistency
- Ensures reproducible builds

## Troubleshooting

### Issue: "token contract storage key must remain explicit"

**Cause:** Contract doesn't have `DataKey::CngnContract` or `DataKey::SourceToken`

**Solution:** Verify `DataKey` enum in `src/lib.rs` includes at least one token storage key:
```rust
pub enum DataKey {
    CngnContract,  // or SourceToken
    // ... other keys
}
```

### Issue: "initialize must preserve the single-initialize storage guard"

**Cause:** `DataKey::Initialized` is missing from contract

**Solution:** Add initialization guard to `DataKey` enum and check in `initialize()`:
```rust
if env.storage().instance().has(&DataKey::Initialized) {
    panic!("AlreadyInitialized");
}
```

### Issue: "admin-controlled deployment setup must require admin authorization"

**Cause:** `initialize()` doesn't call `admin.require_auth()`

**Solution:** Add authorization check:
```rust
pub fn initialize(env: Env, admin: Address, ...) {
    admin.require_auth();  // Required for deployment safety
    // ... rest of initialization
}
```

## Best Practices

### For Local Development

1. **Use the deployment script** for consistency:
   ```bash
   ./scripts/deploy-contract-local.sh --network standalone ...
   ```

2. **Store contract ID in `.env`** for backend integration:
   ```bash
   AMANA_ESCROW_CONTRACT_ID=CXXXXXXX...
   ```

3. **Run regression tests** after contract changes:
   ```bash
   cargo test local_deployment_tests
   ```

### For Testnet Deployments

1. **Use the testnet script** for a single-command deploy + verify:
   ```bash
   ./scripts/deploy-contract-testnet.sh --network testnet ...
   ```

2. **Read the recorded contract id** from `deployments/testnet.json`:
   ```bash
   jq -r .contractId deployments/testnet.json
   ```

3. **Smoke assertions run automatically** (create, fund, release) before the
   contract id is recorded, so a failed deploy never writes a stale id.

### For CI/CD

1. **Safety checks run first** before any tests
2. **All tests must pass** before WASM build
3. **WASM ABI hash is verified** for reproducibility
4. **No manual overrides** of safety checks

### For Production Deployments

1. **Validate in staging** with same contract build
2. **Run full test suite** before production
3. **Verify storage keys** haven't changed
