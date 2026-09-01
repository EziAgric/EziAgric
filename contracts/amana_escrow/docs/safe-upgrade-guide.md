# Amana Escrow — Contract Safe Upgrade Guide

> Issue #111 — Safe upgrade path for contract changes that introduce new admin
> functions (e.g. `admin_clawback`).

This guide covers everything needed to upgrade the `amana_escrow` Soroban
contract safely in testnet and mainnet environments while preserving all
persistent state and keeping backend services and event listeners in sync.

---

## Table of Contents

1. [How Soroban upgrades work](#1-how-soroban-upgrades-work)
2. [Pre-upgrade checklist](#2-pre-upgrade-checklist)
3. [Step-by-step upgrade procedure](#3-step-by-step-upgrade-procedure)
4. [State preservation guarantees](#4-state-preservation-guarantees)
5. [Backend and event listener coordination](#5-backend-and-event-listener-coordination)
6. [Upgrade simulation](#6-upgrade-simulation)
7. [Rollback procedure](#7-rollback-procedure)
8. [Release notes — upgrade warnings](#8-release-notes--upgrade-warnings)

---

## 1. How Soroban upgrades work

The `upgrade(new_wasm_hash)` entry point replaces the contract's WASM bytecode
at the **same contract address**. Persistent storage is never touched by the
upgrade itself — all trade records, admin config, mediator registry entries,
schema version, and accrued fees survive automatically.

The upgrade is atomic: if the new WASM fails to load, the transaction is
rejected and the old code remains in place.

```
upgrade flow
────────────────────────────────────────────────────────────────────────
Admin TX  ──►  upload_contract_wasm  ──►  new_wasm_hash
              │
              └──► upgrade(new_wasm_hash)  ──►  WASM replaced at same address
                                                 Persistent storage UNCHANGED
```

---

## 2. Pre-upgrade checklist

Complete every item before submitting the upgrade transaction.

### 2.1 Storage compatibility

- [ ] `CURRENT_SCHEMA_VERSION` has been bumped **only if** the persistent
  layout changed (new `DataKey` variant, new trade struct field, etc.).
- [ ] New `DataKey` variants are **appended** to the enum — never reordered or
  renamed. XDR encodes keys by name, so reordering breaks existing stored data.
- [ ] If trade fields were added, a new `TradeData::V1(TradeV1)` variant has
  been defined and `load_trade()` handles both `V0` and `V1`.
- [ ] Migration logic is gated on the stored schema version:

  ```rust
  let v = env.storage().instance()
      .get(&DataKey::SchemaVersion)
      .unwrap_or(1u32);
  if v < CURRENT_SCHEMA_VERSION {
      // run one-time migration
      env.storage().instance().set(&DataKey::SchemaVersion, &CURRENT_SCHEMA_VERSION);
  }
  ```

- [ ] `get_schema_version()` still returns `CURRENT_SCHEMA_VERSION` after the
  upgrade (verified by upgrade tests).

### 2.2 Event compatibility

- [ ] Existing event topic symbols are **unchanged** (indexers identify events
  by topic, not by struct layout):

  | Event | Topic symbol |
  |-------|-------------|
  | `TradeCreatedEvent` | `TRDCRT` |
  | `TradeFundedEvent` | `TRDFND` |
  | `TradeCancelledEvent` | `TRDCAN` |
  | `DeliveryConfirmedEvent` | `DELCNF` |
  | `FundsReleasedEvent` | `RELSD` |
  | `DisputeInitiatedEvent` | `DISINI` |
  | `DisputeResolvedEvent` | `DISRES` |
  | `AdminClawbackEvent` | `ADMCLW` |
  | `ContractUpgradedEvent` | `UPGRAD` |

- [ ] New events use a unique 6-character symbol not already in the table above.
- [ ] New event fields are **appended** to the existing event struct (never
  removed or reordered) so old listeners that decode by position still work.

### 2.3 New admin functions (e.g. `admin_clawback`)

- [ ] The function requires `admin.require_auth()` at the entry point.
- [ ] The function is documented in
  `contracts/amana_escrow/docs/admin_clawback_vesting_math.md` and the
  [security review checklist](./security-review-checklist.md) has been completed.
- [ ] Access control tests in `tests/clawback_access_control_tests.rs` cover
  every caller role (admin, buyer, seller, mediator, stranger).
- [ ] The `AdminClawbackEvent` is emitted with the correct topic symbol `ADMCLW`.
- [ ] Backend `ContractClawbackError` service and `contract.service.ts` have been
  updated to handle the new function's error codes.

### 2.4 Test suite

- [ ] Full contract test suite passes:

  ```bash
  cd contracts/amana_escrow
  cargo test
  ```

- [ ] Upgrade compatibility tests pass specifically:

  ```bash
  cargo test --test upgrade_tests
  ```

- [ ] Storage golden tests pass (catches unintended layout changes):

  ```bash
  cargo test --test storage_golden_tests
  ```

- [ ] Auth matrix tests pass (catches access control regressions):

  ```bash
  cargo test --test auth_matrix_tests
  ```

- [ ] Run upgrade simulation script and verify all checks pass:

  ```bash
  cd /path/to/repo
  ./scripts/simulate-contract-upgrade.sh
  ```

### 2.5 Deployment safety

- [ ] Deployment safety script passes:

  ```bash
  ./scripts/check-contract-deployment-safety.sh
  # or the contracts-local variant:
  ./contracts/check-contract-deployment-safety.sh
  ```

---

## 3. Step-by-step upgrade procedure

### Step 1 — Compile the new WASM

```bash
cd contracts/amana_escrow
cargo build --target wasm32-unknown-unknown --release --features wasm
```

The compiled artefact is at:
```
target/wasm32-unknown-unknown/release/amana_escrow.wasm
```

### Step 2 — Upload WASM to the network and capture the hash

Using the Stellar CLI:

```bash
stellar contract upload \
  --network testnet \
  --source <ADMIN_SECRET_KEY_OR_ALIAS> \
  --wasm target/wasm32-unknown-unknown/release/amana_escrow.wasm
# Output: <NEW_WASM_HASH>
```

Record `<NEW_WASM_HASH>` — you need it in Step 4.

### Step 3 — Smoke-test on testnet with the new WASM (optional but recommended)

Deploy a **separate** contract instance on testnet, initialize it, and run a
full happy-path sequence (create → deposit → confirm → release). This validates
the WASM without touching the live contract.

### Step 4 — Invoke `upgrade` on the live contract

```bash
stellar contract invoke \
  --network testnet \
  --source <ADMIN_SECRET_KEY_OR_ALIAS> \
  --id <CONTRACT_ADDRESS> \
  -- upgrade \
  --new_wasm_hash <NEW_WASM_HASH>
```

The transaction emits a `ContractUpgradedEvent` (`UPGRAD`) on success.

### Step 5 — Verify state preservation

After the upgrade, verify that existing data is intact:

```bash
# Read a known trade (replace TRADE_ID with a real ID)
stellar contract invoke \
  --network testnet \
  --source <ADMIN_SECRET_KEY_OR_ALIAS> \
  --id <CONTRACT_ADDRESS> \
  -- get_trade \
  --trade_id <TRADE_ID>

# Verify schema version unchanged
stellar contract invoke \
  --network testnet \
  --source <ADMIN_SECRET_KEY_OR_ALIAS> \
  --id <CONTRACT_ADDRESS> \
  -- get_schema_version
```

Expected: trade data matches pre-upgrade values; schema version is unchanged.

### Step 6 — Smoke-test the new functionality

If the upgrade introduced `admin_clawback`, invoke it on a funded trade in a
test environment to confirm the new function is reachable and emits the
`ADMCLW` event:

```bash
stellar contract invoke \
  --network testnet \
  --source <ADMIN_SECRET_KEY_OR_ALIAS> \
  --id <CONTRACT_ADDRESS> \
  -- admin_clawback \
  --trade_id <FUNDED_TRADE_ID> \
  --reason_hash <REASON_HASH_STRING>
```

### Step 7 — Notify backend and event listener teams

See [Section 5](#5-backend-and-event-listener-coordination) for the full
coordination protocol.

---

## 4. State preservation guarantees

| Storage category | Persists across upgrade? | Notes |
|-----------------|--------------------------|-------|
| Trade records (`TradeData`) | ✅ Yes | Keyed by trade ID in persistent storage |
| Trade status | ✅ Yes | Part of `TradeData` |
| Admin address, `fee_bps`, treasury | ✅ Yes | Stored in instance storage |
| Mediator registry | ✅ Yes | Stored in persistent storage |
| `SchemaVersion` | ✅ Yes | Preserved; bumped only if layout changes |
| Accrued protocol fees | ✅ Yes | Stored in instance storage |
| Trade history events | ✅ Yes | Stored in persistent per-trade storage |

These guarantees are validated by `tests/upgrade_tests.rs` on every CI run.

---

## 5. Backend and event listener coordination

### 5.1 Before upgrade

1. **Coordinate a maintenance window** for any upgrade that changes the ABI
   (adds/removes entry points, changes argument types). Purely additive WASM
   changes that do not alter the ABI can typically be applied without downtime.

2. **Update the backend** (`backend/src/services/contract.service.ts`) to handle
   any new entry points or changed error codes before the contract is upgraded.
   Use a feature flag (`backend/src/services/feature-flags.service.ts`) to gate
   the new code path until the upgrade is confirmed.

3. **Update the event listener** (`backend/src/services/eventListener.service.ts`):
   - Add handlers for any new event topic symbols.
   - Do **not** remove existing handlers — the old events may still appear in
     historical ledger ranges during backfill.

4. **Update ABI compatibility tests** (`backend/src/__tests__/abi.compatibility.test.ts`
   and `abi.version.gate.test.ts`) to reflect the new contract interface.

5. **Merge and deploy the backend** changes first. The updated backend must be
   able to handle both the old and new contract behaviour simultaneously during
   the upgrade window.

### 5.2 During upgrade

1. Optionally pause the escrow API (set `ESCROW_PAUSED=true` in the feature
   flags service) to prevent new trade creation while the contract is mid-upgrade.

2. Submit the `upgrade` transaction (Step 4 above).

3. Confirm the `ContractUpgradedEvent` appears in ledger events.

### 5.3 After upgrade

1. Re-enable the escrow API if it was paused.

2. Verify the backend event listener is receiving `ADMCLW` (or whichever new
   event symbol was added) and processing it correctly.

3. Run the staging smoke test:

   ```bash
   ./scripts/staging-admin-smoke-test.sh
   ```

4. If anything is wrong, follow the [rollback procedure](#7-rollback-procedure).

---

## 6. Upgrade simulation

Run the upgrade simulation script to validate the upgrade path locally without
touching any live network:

```bash
./scripts/simulate-contract-upgrade.sh
```

The script:

1. Verifies the contract compiles cleanly.
2. Runs `cargo test --test upgrade_tests` to confirm all upgrade compatibility
   tests pass.
3. Runs `cargo test --test storage_golden_tests` to confirm storage layout has
   not changed unexpectedly.
4. Runs `cargo test --test auth_matrix_tests` to confirm access control is intact.
5. Runs `cargo test --test clawback_access_control_tests` if the `admin_clawback`
   feature is present.
6. Runs the deployment safety checks.
7. Prints a summary — green if ready to upgrade, red if any check failed.

The simulation is also run as part of the CI pipeline on every PR that touches
`contracts/`.

---

## 7. Rollback procedure

Soroban does not support rolling back a WASM upgrade directly. The rollback
procedure is to re-upload the **previous** WASM and call `upgrade` again with
the old hash.

### Rollback steps

1. Locate the previous WASM hash from your deployment log or the `UPGRAD` event
   emitted by the previous upgrade.

2. If you still have the old `.wasm` binary, upload it:

   ```bash
   stellar contract upload \
     --network testnet \
     --source <ADMIN_SECRET_KEY_OR_ALIAS> \
     --wasm path/to/old/amana_escrow.wasm
   # Output: <OLD_WASM_HASH>
   ```

3. Call `upgrade` with the old hash:

   ```bash
   stellar contract invoke \
     --network testnet \
     --source <ADMIN_SECRET_KEY_OR_ALIAS> \
     --id <CONTRACT_ADDRESS> \
     -- upgrade \
     --new_wasm_hash <OLD_WASM_HASH>
   ```

4. Revert the backend feature flag or deployment to the previous version.

5. Verify state is intact by reading a known trade.

> **Important:** Persistent state is not affected by rolling back the WASM.
> Any data written by the new WASM (e.g. new `DataKey` entries) will remain.
> Ensure the old WASM handles unknown keys gracefully (it will — unknown keys are
> simply ignored on reads that use `get()` returning `Option`).

---

## 8. Release notes — upgrade warnings

Include the following warnings in the release notes for any upgrade that
introduces `admin_clawback` or other new admin functions.

---

### ⚠️ Upgrade Warning — New Admin Function: `admin_clawback`

**What changed:** A new entry point `admin_clawback(trade_id, reason_hash)` has
been added to the contract. This function allows the contract admin to return the
full escrowed amount of a `Funded` trade to the buyer in emergency situations.

**Who is affected:**

- **Contract admin:** Must update their tooling / scripts to use the new function
  if emergency clawbacks are needed. The function requires `admin.require_auth()`.
- **Backend operators:** Ensure `contract.service.ts` and
  `contractClawbackError.service.ts` are updated before applying the upgrade.
- **Event indexers / listeners:** Subscribe to the new `ADMCLW` event topic.
  The event payload contains `trade_id`, `clawback_amount`, `buyer`, and `reason_hash`.
- **Buyers and sellers:** No action required. The clawback path is admin-only and
  only applies to stuck `Funded` trades.

**What does NOT change:**

- Contract address — the upgrade is in-place.
- Existing trade state — all trades are preserved.
- All other entry points — behaviour is unchanged.
- Schema version — remains at `1` (no storage layout change).
- Existing event symbols — all existing topics are unchanged.

**Minimum backend version required:** Deploy the backend changes (ABI compatibility
update + event handler for `ADMCLW`) **before** applying the contract upgrade.

---

## See also

- [`upgrade-considerations.md`](./upgrade-considerations.md) — technical storage
  layout and versioning reference.
- [`security-review-checklist.md`](./security-review-checklist.md) — security
  review checklist for admin clawback and other contract changes.
- [`contracts/amana_escrow/tests/upgrade_tests.rs`](../tests/upgrade_tests.rs) —
  automated upgrade compatibility test suite.
- [`scripts/simulate-contract-upgrade.sh`](../../../scripts/simulate-contract-upgrade.sh) —
  local upgrade simulation script.
- [`docs/migration-rollback-playbook.md`](../../../docs/migration-rollback-playbook.md) —
  broader migration and rollback playbook.
