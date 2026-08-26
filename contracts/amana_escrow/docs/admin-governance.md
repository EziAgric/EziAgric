# Admin Governance Flow Documentation

## Overview

This document describes the governance and compliance model for admin clawback operations in the Amana escrow contract. Admin clawback is a privileged emergency operation that allows the contract administrator to recover escrowed funds under specific circumstances.

## When Clawback is Allowed

Admin clawback is permitted under the following conditions:

1. Trade Status: The trade must be in Funded or Disputed status
2. Authorization: Only the registered contract admin can initiate clawback
3. Amount Validation: Clawback amount must be positive and not exceed remaining escrow balance
4. Purpose: Reserved for emergency situations where normal dispute resolution is not feasible

## Typical Use Cases

Admin clawback should be reserved for exceptional circumstances:

- Frozen counterparty wallet addresses preventing normal trade completion
- Detected fraudulent activity requiring immediate fund recovery
- Smart contract bugs or vulnerabilities requiring emergency intervention
- Legal or regulatory compliance requiring fund recovery
- Unresponsive parties in time-sensitive situations

## Governance Workflow

### Step 1: Authorization

The admin must be authenticated via Stellar account signature:

```rust
admin.require_auth();
```

The contract verifies that the caller matches the stored admin address before proceeding.

### Step 2: Trade Validation

The contract enforces several invariants:

- Trade exists and is in Funded or Disputed status
- Requested clawback amount is greater than zero
- Clawback amount does not exceed remaining escrowed balance
- Cumulative clawbacks do not exceed original trade amount

### Step 3: Fund Transfer

Upon successful validation:

- Funds are transferred from contract escrow to the specified destination address
- Cumulative clawback total is updated in persistent storage
- Trade amount is reduced by clawback amount
- If remaining balance reaches zero, trade status transitions to Cancelled

### Step 4: Event Emission

A ClawbackExecutedEvent is published on-chain containing:

- trade_id: The affected trade identifier
- clawback_amount: Amount recovered in this operation
- remaining_amount: Escrow balance after clawback
- destination: Address receiving the clawed-back funds
- admin: Address of the admin who executed the operation
- schema_version: Event schema version for future compatibility

## Contract Invariants

The contract enforces these critical invariants:

1. Conservation: Total clawback amount never exceeds original escrow amount
2. Authorization: Only the registered admin can execute clawback
3. Auditability: All clawback operations are recorded via events and cumulative totals
4. Idempotency: Multiple partial clawbacks are supported with proper accounting
5. Status Integrity: Only Funded or Disputed trades can be clawed back

## Compliance Requirements

Organizations using admin clawback must:

1. Maintain audit logs of all clawback operations
2. Document business justification for each clawback
3. Implement multi-signature approval workflows off-chain before execution
4. Monitor ClawbackExecutedEvent emissions for compliance tracking
5. Establish clear policies defining when clawback is appropriate
6. Ensure regulatory compliance with jurisdiction-specific requirements

## Sample Flows

### Partial Clawback Example

```
Initial State:
- Trade #123: Funded, 10000 cNGN escrowed

Operation 1:
- Admin calls admin_clawback(trade_id=123, amount=3000, destination=buyer_address)
- Result: 3000 transferred, 7000 remains in escrow
- Event: ClawbackExecutedEvent with clawback_amount=3000, remaining_amount=7000

Operation 2:
- Admin calls admin_clawback(trade_id=123, amount=7000, destination=buyer_address)
- Result: 7000 transferred, 0 remains in escrow
- Trade status: Cancelled
- Event: ClawbackExecutedEvent with clawback_amount=7000, remaining_amount=0
```

### Full Clawback Example

```
Initial State:
- Trade #456: Disputed, 5000 cNGN escrowed

Operation:
- Admin calls admin_clawback(trade_id=456, amount=5000, destination=treasury_address)
- Result: 5000 transferred, 0 remains in escrow
- Trade status: Cancelled
- Event: ClawbackExecutedEvent with clawback_amount=5000, remaining_amount=0
```

## Error Handling

The contract panics with structured error codes for validation failures:

- CLAWBACK_UNAUTHORIZED: Caller is not the registered admin
- CLAWBACK_STREAM_NOT_FOUND: Trade does not exist
- CLAWBACK_INVALID_AMOUNT: Amount is zero or negative
- CLAWBACK_INSUFFICIENT_VESTED: Amount exceeds remaining escrow balance
- CLAWBACK_INVALID_STATUS: Trade is not in Funded or Disputed status

## Integration with Backend

The backend should:

1. Listen for ClawbackExecutedEvent emissions via Stellar Horizon
2. Parse events to update off-chain database records
3. Implement replay protection using event deduplication
4. Validate event schema_version for compatibility
5. Alert administrators when clawbacks occur
6. Maintain comprehensive audit trails

## Query Methods

The contract provides state query methods for transparency:

- get_clawback_total(trade_id): Returns cumulative clawed-back amount for a trade
- get_claimed_amount(trade_id): Returns amount released to seller (accounting for clawbacks)
- get_stream_accounting(trade_id): Returns tuple of (original_amount, claimed_amount, clawback_total)

These queries enable off-chain systems to verify on-chain state and maintain accurate accounting.

## Security Considerations

1. Admin Key Security: The admin private key must be secured using hardware wallets or multi-signature schemes
2. Timelock: Consider implementing timelock delays for clawback operations to allow for dispute windows
3. Monitoring: Real-time monitoring of ClawbackExecutedEvent emissions is essential
4. Rate Limiting: Off-chain governance should implement rate limits on clawback frequency
5. Transparency: All clawback operations are permanently recorded on-chain for public auditability

## Related Documentation

- Contract README: Migration and deployment safety
- Backend admin docs: docs/admin-operations.md
- Event schema documentation: ClawbackExecutedEvent structure
- Compliance runbooks: Incident response procedures
- Backend event idempotency: docs/admin-operations.md Event Idempotency Guarantees section
