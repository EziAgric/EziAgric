# Release Note — Admin Clawback

## Overview

Adds and documents the **admin clawback** feature: an emergency escape hatch that
lets the contract administrator recover escrowed funds under specific
circumstances, with full audit trail and idempotency guarantees. This release
note covers the admin feature, contract changes, documentation, and supporting
infrastructure so stakeholders and operators have a single consistent account of
what shipped.

## Feature

### Admin features

- `POST /admin/contract/fee` — admin builds an unsigned `update_fee_bps` XDR (admin only)
- `admin_clawback(trade_id, clawback_amount, destination)` — admin recovers
  escrowed funds back to the buyer or treasury (admin only)

### Contract changes

- Event: `ClawbackExecutedEvent` — emitted with `schema_version`, `admin`,
  `clawback_amount`, `remaining_amount`, `destination`, `trade_id`
- Views: `get_clawback_total(trade_id)`, `get_claimed_amount(trade_id)`,
  `get_stream_accounting(trade_id)`
- Invariants: `clawback_amount > 0`, `clawback_amount <= trade.amount`,
  cumulative clawbacks never exceed the original escrow amount,
  post-transfer conservation self-check
- Idempotency: backend deduplicates reordered/duplicate events via the
  `ProcessedEvent` composite unique key `(ledgerSequence, contractId, eventId)`

### Docs

- `docs/releases/2026-08-28-admin-clawback.md` — this release note
- `docs/admin_clawback_function.md` — admin clawback function specification
- `docs/admin-operations.md` — admin routes, event idempotency guarantees
- `contracts/amana_escrow/docs/admin-governance.md` — governance & compliance model
- `contracts/amana_escrow/docs/admin_clawback_vesting_math.md` — vesting math invariants
- `docs/contract-error-codes.md` — clawback error codes (`CLAWBACK_INVALID_AMOUNT`, …)

### Infra & operations

- Deployment: backend service plus Amana escrow contract artifact
- Secrets: `ADMIN_SECRET_KEY` unchanged; rotation policy in
  `docs/admin-secret-rotation.md`
- Network: admin endpoints remain network-isolated
  (`docs/admin-network-isolation.md`)
- CI/Policy: admin regression tests enforced by `docs/admin-ci-policy.md`

## Verification

- [x] Admin feature documented with route and caller
- [x] Contract changes documented with events and views
- [x] Docs section links resolve
- [x] Infra/ops actions captured for operators
- [x] Release note stored under `docs/releases/`

## Related Issues

- Closes #125
