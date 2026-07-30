# `admin_clawback` — Vesting Math Protection

> Issue #91 — Contract state invariants for clawback arithmetic.

## What `admin_clawback` does

`admin_clawback` is an emergency escape-hatch that lets the contract admin
transfer the full escrowed amount of a `Funded` trade back to the buyer
without requiring the buyer's consent or a formal dispute.

It is used when a trade is permanently stuck — e.g. due to frozen counterparty
keys, detected fraud, or a compliance hold — and the normal cancellation or
expiry-refund paths cannot be used.

## How vesting math is protected

Unlike `resolve_dispute` (which uses loss-sharing multiplications) or
`release_funds` (which deducts a platform fee), **`admin_clawback` performs
no arithmetic on the escrowed amount**. The function:

1. Reads `trade.amount` verbatim from persistent storage.
2. Uses that value as-is for a single `token.transfer` call.
3. Checks four invariants before and after the transfer.

This design eliminates overflow/underflow risk for the clawback path entirely.

## Invariants (labelled in `lib.rs`)

| Label | Assertion | Guards against |
|-------|-----------|---------------|
| **INVARIANT 1** | `trade.status == Funded` | Clawback on already-settled or cancelled trades |
| **INVARIANT 2** | `clawback_amount > 0` | Zero-value no-op that would pollute the audit trail |
| **INVARIANT 3** | `clawback_amount <= trade.amount` | Defensive upper bound; catches any future code path that mutates `trade.amount` before calling this function |
| **INVARIANT 4** | `clawback_amount == trade.amount` (post-transfer) | Conservation self-check; would fire if a token contract bug inflated or deflated the transferred amount |

## Why loss ratios are ignored

`buyer_loss_bps` and `seller_loss_bps` are trade-creation parameters that
govern _dispute resolution_ payouts. An admin clawback is an out-of-band
administrative action, not a dispute settlement. The buyer receives 100% of
the escrowed amount regardless of the loss ratios agreed at trade creation.

## Access control

See [`docs/access_control_tests.md`](../docs/access_control_tests.md) and
`tests/clawback_access_control_tests.rs` for the full matrix.

In summary:

| Caller | Outcome |
|--------|---------|
| Contract admin | ✅ Succeeds |
| Buyer | ❌ `"admin_clawback: caller is not the admin"` |
| Seller | ❌ `"admin_clawback: caller is not the admin"` |
| Mediator | ❌ `"admin_clawback: caller is not the admin"` |
| Treasury | ❌ `"admin_clawback: caller is not the admin"` |
| Stranger | ❌ `"admin_clawback: caller is not the admin"` |

## Test coverage

| File | What it covers |
|------|---------------|
| `tests/clawback_invariant_tests.rs` | Arithmetic invariants, conservation, edge cases (1 stroop, MAX_TRADE_VALUE), history record, multi-trade isolation |
| `tests/clawback_access_control_tests.rs` | Access control for every role; status-gate rejections for non-Funded states |
