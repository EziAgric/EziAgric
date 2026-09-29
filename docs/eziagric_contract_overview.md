# EziAgric Contract Architecture Overview

Technical design document outlining agriculture supply chain escrow state rules.

Diagrams: [trade lifecycle](./architecture/trade-lifecycle.md) ·
[dispute flow](./architecture/dispute-flow.md) ·
[contract modules](./architecture/contract-modules.md)

## Module map

`contracts/amana_escrow/src/lib.rs` used to hold the whole contract (~9.2k
lines). It is now split into cohesive modules (#347). Each entrypoint module
contributes its own `#[contractimpl] impl EscrowContract` block; the exported
function set, every `DataKey` variant and every event topic are byte-for-byte
identical to the single-file layout, and all public items are re-exported from
the crate root so `crate::X` / `amana_escrow::X` paths keep working.

| Module | Responsibility | Key items |
|---|---|---|
| `lib.rs` | Crate root: module declarations, re-exports, policy constants, `#[contract] EscrowContract` | `CURRENT_SCHEMA_VERSION`, `EVENT_SCHEMA_VERSION`, `MAX_TRADE_VALUE`, `MAX_TRADE_BATCH`, quorum/extension defaults |
| `storage.rs` | Storage keys and low-level helpers | `DataKey`, `NXTTRD`, `load_trade`/`save_trade`, `bump_instance_ttl`, `assert_not_paused`, release-sequence and trade-history helpers |
| `types.rs` | Persistent `#[contracttype]` values | `TradeV0`/`Trade`, `TradeData`, `TradeStatus`, `ReleaseSequence`, quorum/extension/timelock types, `PartialDeliveryProposal` |
| `events.rs` | `#[contractevent]` definitions (parsed by `scripts/codegen-events.mjs`) | `TRDCRT` … `UPGQUE`, `PDPROP`, `PARTDL` |
| `errors.rs` | Error codes | `clawback_errors`, `timelock_errors`, typed `EscrowError` |
| `fees.rs` | Fee configuration and basis-point math | `update_fee_bps`, `withdraw_fees`, `get_fee_bps`, `checked_fee_amount`, `checked_loss_amount`, `partial_delivery_split` |
| `admin.rs` | Admin & governance | `initialize`, mediator/guardian registries, `pause`, asset allowlist, timelocked clawback & upgrade, `admin_clawback`, config getters |
| `trade.rs` | Trade lifecycle and views | `create_trade`, `deposit`, path payments, cancellation, expiry, deadline extensions, `confirm_delivery`, `release_funds`, manifest/video proof, `get_trade`, `get_trades` |
| `partial_delivery.rs` | Pro-rata settlement of short shipments | `confirm_partial_delivery`, `accept_partial_delivery`, `escalate_partial_delivery`, `get_partial_delivery` |
| `dispute.rs` | Disputes | `initiate_dispute`, `resolve_dispute`, mediator quorum voting & fallback, evidence |
| `test.rs` | Contract unit tests (the former inline `mod test`; module path unchanged so `test_snapshots/` still match) | — |

Storage-layout rules: append new `DataKey` variants at the end of the enum
only, and never rename/reorder `#[contracttype]` fields — see
[storage layout gate](./storage-layout-gate.md).

## Batch reads

`get_trades(ids: Vec<u64>) -> Vec<Option<Trade>>` returns one entry per id in
input order (`None` for unknown ids, never a panic). At most `MAX_TRADE_BATCH`
(50) ids are accepted per call; larger batches fail with
`EscrowError::BatchTooLarge` (`Error(Contract, #1)`). Footprint:
[gas estimation](../contracts/amana_escrow/docs/gas-estimation.md).

## Partial delivery

Shipments often arrive short. Instead of forcing a dispute, the buyer calls
`confirm_partial_delivery(trade_id, delivered_bps)` on a `Funded` trade. The
seller has `PARTIAL_DELIVERY_ACCEPT_WINDOW_SECS` (3 days) to call
`accept_partial_delivery(trade_id)`. Otherwise the seller (at any time, to
reject) or the buyer (after the window closes) calls
`escalate_partial_delivery`, which opens a regular dispute with reason
`partial_delivery_not_accepted`. While a proposal is pending the buyer cannot
also claim an expiry refund.

### Settlement math

```
delivered     = total * delivered_bps / 10_000
undelivered   = total - delivered
buyer_refund  = undelivered * seller_loss_bps / 10_000   # seller's share of the shortfall
fee           = delivered * fee_bps / 10_000              # fee on delivered goods only
seller_amount = total - buyer_refund - fee                # absorbs rounding dust
```

The buyer's share of the shortfall (`buyer_loss_bps`) stays with the seller,
mirroring how `resolve_dispute` applies the `Loss_Ratio`. Every remainder is
assigned by subtraction, so `seller_amount + buyer_refund + fee == total`
exactly — no dust is left in escrow.

### Worked example

A 100-bag trade escrowing **10,000 cNGN**, 1% platform fee (`fee_bps = 100`),
loss ratio 50/50. Only **80 bags** arrive, so the buyer proposes
`delivered_bps = 8_000`.

| Step | Value |
|---|---|
| delivered | 10,000 × 8,000 / 10,000 = **8,000** |
| undelivered | 10,000 − 8,000 = **2,000** |
| buyer_refund (seller bears 50% of 2,000) | 2,000 × 5,000 / 10,000 = **1,000** |
| fee (1% of delivered only) | 8,000 × 100 / 10,000 = **80** |
| seller_amount | 10,000 − 1,000 − 80 = **8,920** |
| check | 8,920 + 1,000 + 80 = **10,000** ✓ |

The seller receives 7,920 for the 80 delivered bags (8,000 − 80 fee) plus
1,000 for the buyer's half of the missing 20 bags. The fee is 80, not the 100
a full release would charge.

Edge cases, all covered by `src/tests/partial_delivery_tests.rs`:

| `delivered_bps` | delivered | fee | buyer_refund | seller_amount |
|---|---|---|---|---|
| 0 | 0 | 0 | 5,000 | 5,000 |
| 1 | 1 | 0 | 4,999 | 5,001 |
| 5,000 | 5,000 | 50 | 2,500 | 7,450 |
| 10,000 | 10,000 | 100 | 0 | 9,900 (same as `release_funds`) |

Settlement emits `PARTDL` (`PartialDeliverySettledEvent`) with
`delivered_amount`, `undelivered_amount`, `seller_amount`, `buyer_refund` and
`fee_amount`. The proposal itself emits `PDPROP`.
