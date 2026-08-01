# Contract Upgrade Considerations

This document describes how to safely upgrade the Amana Escrow Soroban contract
without breaking existing state or event listener compatibility.

---

## How Soroban Upgrades Work

The `upgrade(new_wasm_hash)` function replaces the contract's WASM bytecode at
the same contract address. Persistent storage is **not touched** — all trade
records, admin config, mediator registry entries, and accrued fees survive the
upgrade automatically.

---

## Storage Layout Compatibility

The contract uses a `CURRENT_SCHEMA_VERSION` constant (currently `1`) written
to instance storage at `initialize()`. Before any structural storage change,
bump this version:

```rust
pub const CURRENT_SCHEMA_VERSION: u32 = 2; // bump when layout changes
```

Then gate migration logic on the old version:

```rust
let version = env.storage().instance()
    .get(&DataKey::SchemaVersion)
    .unwrap_or(1u32);
if version < 2 {
    // run migration
}
env.storage().instance().set(&DataKey::SchemaVersion, &2u32);
```

The `DataKey` enum uses named variants. **Always append new variants** — never
reorder or rename existing ones, as the XDR encoding is keyed by position.

---

## Versioned Trade Storage

Trade data is wrapped in a `TradeData` enum:

```rust
pub enum TradeData {
    V0(TradeV0),
    // V1(TradeV1), // future: append here
}
```

To add fields to the trade struct:
1. Define a new `TradeV1` struct with the extra fields.
2. Add `V1(TradeV1)` to the enum.
3. Update `load_trade()` to handle both variants.
4. New trades write `TradeData::V1`; old trades read as `V0` and are migrated lazily.

---

## Event Listener Compatibility

Events are identified by their first topic symbol. The symbols are short
(up to 9 chars) and defined with `symbol_short!()`. **Do not change an existing
topic string** — event indexers and downstream listeners identify event types by
topic.

| Event                  | Topic symbol |
|------------------------|--------------|
| `TradeCreatedEvent`    | `TRDCRT`     |
| `TradeFundedEvent`     | `TRDFND`     |
| `TradeCancelledEvent`  | `TRDCAN`     |
| `DeliveryConfirmedEvent` | `DELCNF`   |
| `FundsReleasedEvent`   | `RELSD`      |
| `DisputeInitiatedEvent` | `DISINI`    |
| `DisputeResolvedEvent` | `DISRES`     |
| `AdminClawbackEvent`   | `ADMCLW`     |
| `ContractUpgradedEvent` | `UPGRAD`    |

To add a new event, pick a unique 6-character symbol and document it here.

---

## Pre-Upgrade Checklist

1. **Run the upgrade compatibility test suite:**
   ```bash
   cd contracts/amana_escrow
   cargo test --test upgrade_tests
   ```
2. Verify `CURRENT_SCHEMA_VERSION` does not need bumping for the new code.
3. Confirm `DataKey` variants are only appended, never reordered.
4. Confirm event topic strings are unchanged.
5. Deploy WASM to testnet and call `upgrade(new_wasm_hash)` via admin key.
6. Smoke-test: read an existing trade, create a new trade, verify events.

---

## Test Coverage

Upgrade compatibility tests live in:

```
contracts/amana_escrow/tests/upgrade_tests.rs
```

They cover:
- State preservation of Created and Funded trades
- Admin config (admin address, fee_bps, treasury) survives upgrade
- Mediator registry survives upgrade
- Schema version remains unchanged
- All lifecycle operations (cancel, confirm delivery, release, dispute) work on
  pre-upgrade state after upgrade
- Events emit correctly after upgrade
- Accrued fees survive upgrade
- Multiple sequential upgrades maintain consistency
