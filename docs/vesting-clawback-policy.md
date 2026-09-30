# Vesting & Admin Clawback Policy

**Issue:** #122  
**Status:** Active  
**Last reviewed:** 2026-09-29

This document is the single source of truth for the contract vesting model and the admin clawback policy in Amana. It covers business rules, technical implementation, allowed scenarios, worked examples, and links to the canonical implementation references.

---

## Table of Contents

1. [Overview](#overview)
2. [Vesting Model](#vesting-model)
3. [Admin Clawback: Business Policy](#admin-clawback-business-policy)
4. [Admin Clawback: Technical Implementation](#admin-clawback-technical-implementation)
5. [Allowed Scenarios](#allowed-scenarios)
6. [Prohibited Scenarios](#prohibited-scenarios)
7. [Worked Examples](#worked-examples)
8. [Compliance Requirements](#compliance-requirements)
9. [Related Documentation](#related-documentation)

---

## Overview

Amana escrow trades lock buyer funds on-chain until a delivery condition is met. Once deposited, the **vested balance** of a trade is the amount currently held in escrow and eligible for release, refund, or admin intervention.

The **admin clawback** is an emergency escape-hatch that allows the contract administrator to recover the escrowed balance of a stuck or compromised trade without requiring buyer/seller consent or a formal dispute resolution. It is a privileged, audited, irreversible on-chain action and must only be used when no other settlement path is feasible.

---

## Vesting Model

### What "vesting" means in Amana

In the Amana context, _vesting_ refers to the lifecycle of escrowed funds from deposit through to final settlement. Unlike time-based token vesting schedules, Amana's escrow balance is considered **fully vested at deposit** — the full trade amount is immediately locked and eligible for either release, refund, or clawback.

The admin-facing stream endpoints expose these derived fields:

| Field | Description |
|---|---|
| `totalVested` | Total amount ever deposited into the escrow for this trade |
| `claimed` | Amount already released to the seller (settled trades) |
| `unclaimed` | Remaining escrowed balance (`totalVested - claimed - clawback_total`) |
| `pendingClawback` | Amount queued for clawback but not yet executed (timelock period) |

A stream's `vestingState` (returned by `GET /admin/streams`) is derived from `claimed` vs. `totalVested`:

| `vestingState` | Condition |
|---|---|
| `not_started` | `claimed == 0` and trade is still `Funded` |
| `vesting` | `claimed > 0` and `claimed < totalVested` |
| `fully_vested` | `claimed == totalVested` (trade `COMPLETED`) |

### Conservation invariants

The contract enforces these invariants at all times:

- `clawback_total ≤ original_trade_amount`
- `claimed + clawback_total ≤ original_trade_amount`
- After a clawback: `remaining_balance = trade.amount - clawback_amount`

No arithmetic is performed on the escrowed amount during a clawback — the value is read verbatim from storage and used directly in a single token transfer, eliminating overflow/underflow risk on this path.

---

## Admin Clawback: Business Policy

### Purpose

Admin clawback exists to handle situations where the **normal settlement paths cannot complete**. It is not a substitute for dispute resolution or normal trade cancellation.

### When clawback IS permitted

Clawback may only be initiated when **at least one** of the following conditions holds:

1. **Frozen counterparty** — a buyer or seller's Stellar wallet address has become permanently inaccessible (key loss, account freeze, or death of a sole signatory), making normal settlement impossible.
2. **Detected fraud** — confirmed fraudulent activity (e.g. identity theft, forged delivery evidence) where funds must be recovered immediately to prevent irreversible loss.
3. **Legal or regulatory hold** — a court order, regulatory directive, or compliance obligation mandates the recovery of specific funds.
4. **Smart contract incident** — a critical bug or vulnerability in the contract or a dependency requires emergency fund recovery before an attacker can exploit it.
5. **Permanently unresponsive parties** — all dispute resolution and expiry-refund paths have been exhausted, and parties remain unresponsive beyond any grace period defined in the trade agreement.

### Authorization requirements

All clawbacks require:

- The initiating admin's Stellar public key to be present in `ADMIN_STELLAR_PUBKEYS`.
- A documented business justification (the `note` field on `POST /treasury/withdraw` and `terminate`; mandatory for compliance audits).
- Off-chain approval per the organization's governance workflow before execution (multi-sig, compliance sign-off, or management approval — determined by trade value).

### Irreversibility

**A submitted clawback cannot be undone.** Once the signed transaction is broadcast and confirmed on-chain, the transfer is permanent. Always:

1. Run the preview endpoint (`POST /admin/streams/:id/clawback/preview`) before executing.
2. Dry-run via the CLI (`--dry-run` flag) if using the CLI path.
3. Obtain required approvals _before_ producing a signed transaction.

---

## Admin Clawback: Technical Implementation

### Contract entry points

| Function | Description |
|---|---|
| `admin_clawback(trade_id, amount, destination)` | Immediate single-step clawback (legacy path, still supported) |
| `queue_clawback(trade_id, amount, destination)` | Queues a clawback operation with a mandatory timelock delay (recommended) |
| `execute_clawback(operation_id)` | Executes a queued clawback after the timelock delay has elapsed |
| `cancel_queued_operation(operation_id)` | Cancels a pending queued operation before it executes |

### Timelock delays

All new clawback operations should use the queued path, which enforces a mandatory delay:

| Operation | Default delay |
|---|---|
| Clawback | 1 day (86,400 seconds) |
| Contract upgrade | 7 days (604,800 seconds) |

The delay provides a window for monitoring systems and community guardians to detect and cancel potentially malicious or erroneous operations.

### Access control

The contract reads the admin address exclusively from instance storage (`DataKey::Admin`). It is never accepted as a caller-supplied argument. `require_auth()` is called on the stored admin address before any state mutation — no state change is reachable by an unauthorized caller.

| Caller | Outcome |
|---|---|
| Contract admin | ✅ Succeeds |
| Buyer | ❌ `CLAWBACK_UNAUTHORIZED` |
| Seller | ❌ `CLAWBACK_UNAUTHORIZED` |
| Mediator | ❌ `CLAWBACK_UNAUTHORIZED` |
| Any other address | ❌ `CLAWBACK_UNAUTHORIZED` |

### Contract invariants enforced

| # | Assertion | Guards against |
|---|---|---|
| 1 | `trade.status ∈ {Funded, Disputed}` | Clawback on already-settled or cancelled trades |
| 2 | `clawback_amount > 0` | Zero-value no-ops that pollute the audit trail |
| 3 | `clawback_amount ≤ trade.amount` | Over-clawback; catches any future mutation of `trade.amount` |
| 4 | Conservation check post-transfer | Catches any token contract behavior that inflates or deflates the transferred amount |

### Feature flag

Clawback is additionally gated by the `ClawbackEnabled` instance-storage flag (defaults to `true`). The admin can toggle it via `set_clawback_enabled(bool)`. This allows operators to freeze clawback capability during an incident without a contract upgrade.

### Error codes

| Code | Meaning |
|---|---|
| `CLAWBACK_UNAUTHORIZED` | Caller is not the registered admin |
| `CLAWBACK_STREAM_NOT_FOUND` | Trade does not exist |
| `CLAWBACK_INVALID_AMOUNT` | Amount is zero, negative, or non-integer |
| `CLAWBACK_INSUFFICIENT_VESTED` | Amount exceeds remaining escrowed balance (`unclaimed`) |
| `CLAWBACK_INVALID_STATUS` | Trade is not in `Funded` or `Disputed` status |

### Backend API path

The backend exposes clawback operations through admin-protected endpoints (requires wallet on `ADMIN_STELLAR_PUBKEYS`):

| Endpoint | Purpose |
|---|---|
| `GET /admin/streams` | List streams with vesting state and unclaimed balances |
| `POST /admin/streams/:id/clawback/preview` | Validate amount without executing |
| `POST /admin/streams/:id/terminate` | Terminate and clawback a stream (records `AdminActionAudit`) |
| `POST /treasury/withdraw` | Build unsigned withdrawal XDR with compliance note |

All admin operations are subject to:
- Rate limiting: 10 clawbacks per hour per admin identity (configurable via `ADMIN_QUOTA_CLAWBACK_MAX` / `ADMIN_QUOTA_CLAWBACK_WINDOW_MS`)
- Request timeout: 15 seconds (configurable via `ADMIN_ROUTE_TIMEOUT_MS`)
- Audit logging: every action written to `AdminActionAudit` with `actorAddress`, `note`, and `timestamp`

### CLI path

The CLI (`backend/scripts/clawback.ts`) bypasses the HTTP API and calls the contract directly. Use this when the API is unavailable:

```bash
# Dry run (inspect without signing)
ADMIN_SECRET_KEY=S... npx tsx backend/scripts/clawback.ts \
  --stream-id <trade-id> \
  --amount <amount-in-stroops> \
  --dry-run

# Produce signed transaction
ADMIN_SECRET_KEY=S... npx tsx backend/scripts/clawback.ts \
  --stream-id <trade-id> \
  --amount <amount-in-stroops> \
  --network mainnet
```

The tool prints the signed XDR but does **not** submit it automatically. Submission is a deliberate second step to reduce accidental execution risk.

### On-chain events emitted

Every clawback execution emits a `ClawbackExecutedEvent` containing:

| Field | Description |
|---|---|
| `trade_id` | The affected trade identifier |
| `clawback_amount` | Amount recovered in this operation |
| `remaining_amount` | Escrow balance after clawback |
| `destination` | Address receiving the funds |
| `admin` | Address of the admin who executed the operation |
| `schema_version` | Event schema version for compatibility |

Timelock operations additionally emit `TimelockOperationQueued`, `TimelockOperationExecuted`, and `TimelockOperationCancelled` events.

---

## Allowed Scenarios

### Scenario 1: Full clawback of a frozen-counterparty trade

**Condition:** Seller's wallet is permanently inaccessible (key loss). Trade is `Funded` with 5,000 cNGN. Buyer requests recovery.

**Action:** Admin queues a full clawback to the buyer's address after obtaining off-chain approval.

**Result:** 5,000 cNGN transferred to buyer. Trade status → `Cancelled`. `ClawbackExecutedEvent` emitted.

### Scenario 2: Partial clawback during an active dispute

**Condition:** Trade is `Disputed` with 10,000 cNGN. Mediator evidence confirms 30% was legitimately delivered. Admin claws back 70% (7,000 cNGN) to the buyer; the remaining 3,000 cNGN is released to the seller via normal dispute resolution.

**Action:** Admin executes a partial clawback of 7,000 cNGN, then the mediator resolves the dispute for the residual 3,000 cNGN.

**Result:** Conservation maintained: `7,000 + 3,000 = 10,000` (original amount).

### Scenario 3: Emergency clawback during a smart contract incident

**Condition:** A critical bug is discovered. All funded trades are at risk. Admin must drain escrow balances immediately.

**Action:** Admin calls `set_clawback_enabled(true)` (if not already), then queues clawbacks for all affected trades. Monitoring systems alert on `TimelockOperationQueued` events. After the 1-day window (or via an emergency bypass if governance approves), executes clawbacks.

**Result:** Funds recovered. Incident documented in [incident-response.md](./runbooks/incident-response.md). Post-mortem filed in [postmortems/](./postmortems/).

### Scenario 4: Regulatory compliance hold

**Condition:** A jurisdiction-specific regulatory order requires funds from a specific trade to be frozen and returned to the buyer.

**Action:** Admin submits clawback with compliance note referencing the regulatory order number. Record kept in `AdminActionAudit`.

**Result:** On-chain audit trail satisfies regulator evidence requirements.

---

## Prohibited Scenarios

The following uses of admin clawback are explicitly **not permitted**:

| Prohibited use | Reason |
|---|---|
| Clawback as a substitute for normal dispute resolution | Use the mediator flow instead. Clawback bypasses agreed loss ratios. |
| Clawback of a `COMPLETED` or `CANCELLED` trade | Contract enforces status invariant — will panic. |
| Clawback of an amount exceeding the remaining escrow balance | Contract enforces conservation invariant — will panic. |
| Clawback without a documented justification | Violates compliance requirements; audit record is incomplete. |
| Clawback in response to buyer/seller pressure without evidence | Admin must remain neutral. Operational logs must support the decision. |
| Repeated clawbacks of the same trade to circumvent the single-call pattern | Partial clawbacks are technically supported but require individual documented justifications. |

---

## Worked Examples

### Example A: Query stream state before clawback

```bash
# 1. List streams and find the one to claw back
curl -s -H "Authorization: Bearer $ADMIN_JWT" \
  "https://api.amana.trade/api/admin/streams?status=ACTIVE" | jq '.items[] | select(.streamId == "stream-abc-123")'

# Expected response (relevant fields):
# {
#   "streamId": "stream-abc-123",
#   "status": "ACTIVE",
#   "vestingState": "vesting",
#   "totalVested": "10000",
#   "claimed": "2500",
#   "unclaimed": "7500",
#   "pendingClawback": "0"
# }
```

### Example B: Preview a clawback

```bash
# 2. Preview - validate amount without executing
curl -s -X POST \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"amount": "5000"}' \
  "https://api.amana.trade/api/admin/streams/stream-abc-123/clawback/preview"

# Expected response:
# {
#   "streamId": "stream-abc-123",
#   "remainingVested": "7500",
#   "requestedClawback": "5000",
#   "postClawbackBalance": "2500",
#   "preview": true
# }
```

### Example C: Execute via stream termination

```bash
# 3. Execute clawback (terminate stream, full balance)
curl -s -X POST \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Frozen counterparty wallet - buyer key loss confirmed OPS-89"}' \
  "https://api.amana.trade/api/admin/streams/stream-abc-123/terminate"
```

### Example D: Full contract-level lifecycle with timelock

```
# Queue the clawback (1-day delay starts)
queue_clawback(trade_id="trade-001", amount=7500, destination=buyer_address)
→ operation_id="op-xyz-789"
→ execute_after = now + 86400 seconds
→ TimelockOperationQueued event emitted

# [24+ hours later] Execute after delay
execute_clawback(operation_id="op-xyz-789")
→ 7500 cNGN transferred to buyer_address
→ remaining_amount = 0
→ trade.status → Cancelled
→ ClawbackExecutedEvent emitted
→ TimelockOperationExecuted event emitted
```

### Example E: Cancel a queued clawback

```
# If the operation was queued in error or circumstances changed:
cancel_queued_operation(operation_id="op-xyz-789")
→ operation.cancelled = true
→ TimelockOperationCancelled event emitted
→ Execution is permanently blocked for this operation_id
```

---

## Compliance Requirements

Organizations operating Amana infrastructure must ensure the following:

1. **Audit logs**: All clawback operations must be logged with admin identity, timestamp, amount, trade ID, and business justification. The `AdminActionAudit` table and on-chain `ClawbackExecutedEvent` together form the complete audit record.
2. **Justification**: Every clawback must include a `note` field (max 2,000 chars) with a human-readable reason and any reference to supporting tickets, legal orders, or incident IDs.
3. **Off-chain approval**: Before executing any clawback, obtain written approval from the required approvers (determined by trade value and organizational governance policy).
4. **Monitoring**: Real-time monitoring of `TimelockOperationQueued` and `ClawbackExecutedEvent` emissions is mandatory. Alerts must be configured — see [alert-routing-policy.md](./alert-routing-policy.md).
5. **Rate limits**: Respect the configured rate limits (`ADMIN_QUOTA_CLAWBACK_MAX` per `ADMIN_QUOTA_CLAWBACK_WINDOW_MS`) and do not attempt to route around them.
6. **Key security**: The `ADMIN_SECRET_KEY` must be secured in a hardware wallet or multi-sig scheme. Never pass it directly on the command line. Use environment variables or a secrets manager — see [secrets-policy.md](./secrets-policy.md).
7. **Jurisdictional compliance**: Ensure clawback operations comply with applicable financial regulations in the relevant jurisdiction(s). Maintain documentation for regulatory inspection.

---

## Related Documentation

### Contract layer
- [`contracts/amana_escrow/docs/admin-governance.md`](../contracts/amana_escrow/docs/admin-governance.md) — on-chain governance model, invariants, feature flag, query methods
- [`contracts/amana_escrow/docs/admin_clawback_vesting_math.md`](../contracts/amana_escrow/docs/admin_clawback_vesting_math.md) — vesting math protection and conservation invariants
- [`docs/TIMELOCK_POLICY.md`](./TIMELOCK_POLICY.md) — timelock mechanism, upgrade authorization, and governance model

### API layer
- [`docs/api/admin.md`](./api/admin.md) — admin endpoints reference: streams, clawback preview, termination, treasury withdrawal, audit trail
- [`docs/admin-operations.md`](./admin-operations.md) — backend admin operations and event idempotency

### Operations
- [`docs/cli-clawback.md`](./cli-clawback.md) — CLI tool reference (`backend/scripts/clawback.ts`)
- [`docs/runbooks/emergency-clawback.md`](./runbooks/emergency-clawback.md) — step-by-step emergency clawback runbook (API + CLI paths)
- [`docs/admin-secret-management.md`](./admin-secret-management.md) — provisioning and rotating `ADMIN_SECRET_KEY`
- [`docs/admin-tx-failure-alerting.md`](./admin-tx-failure-alerting.md) — alerting on repeated Soroban submission failures

### Security & compliance
- [`docs/secrets-policy.md`](./secrets-policy.md) — secrets inventory and rotation policy
- [`docs/threat-model.md`](./threat-model.md) — threat model covering compromised admin key scenarios
- [`docs/contract-error-codes.md`](./contract-error-codes.md) — full error code reference
