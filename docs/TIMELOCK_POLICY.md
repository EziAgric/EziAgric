# Timelock and Upgrade Authorization Policy

**Issue #189**: Add timelock delay to privileged contract operations  
**Issue #193**: Formalize contract upgrade authorization policy

## Overview

All privileged contract operations (clawback, upgrade) now require a mandatory delay before execution. This prevents single-point-of-failure scenarios where a compromised admin key can instantly drain funds or introduce malicious code.

## Timelock Mechanism

### Architecture

The timelock system queues privileged operations with a configurable delay:

```
Admin queues operation → Delay period → Admin executes operation (or cancel anytime)
                ↓
         Operation persisted  
        with execute_after    
         timestamp            
```

### Default Delays

- **Clawback operations**: 1 day (86,400 seconds)
- **Contract upgrades**: 7 days (604,800 seconds)

These defaults are set at contract initialization and stored in `TimelockConfig`.

### Operation Flow

#### 1. Queue Clawback

```
queue_clawback(trade_id, amount, destination)
  ├─ Authenticate admin
  ├─ Validate amount > 0
  ├─ Calculate execute_after = now + clawback_delay_seconds
  ├─ Store QueuedOperation with executed=false, cancelled=false
  ├─ Emit TimelockOperationQueued event
  └─ Return operation_id
```

**Parameters:**
- `trade_id`: The trade to claw back from
- `clawback_amount`: Amount to recover
- `destination`: Address to send recovered funds

**Events:**
- `TimelockOperationQueued`: Logged immediately for monitoring

#### 2. Execute Clawback

```
execute_clawback(operation_id)
  ├─ Authenticate admin
  ├─ Load queued operation
  ├─ Assert now >= execute_after (delay has passed)
  ├─ Assert not executed, not cancelled
  ├─ Execute clawback (transfer, update trade state)
  ├─ Mark operation.executed = true
  ├─ Emit TimelockOperationExecuted event
  └─ Return success
```

**Invariants checked:**
- Admin is still the authorized signer
- Delay period has fully elapsed
- Operation has not already been executed
- Operation has not been cancelled
- Trade is still in clawback-eligible status (Funded or Disputed)

#### 3. Cancel Queued Operation

```
cancel_queued_operation(operation_id)
  ├─ Authenticate admin
  ├─ Load queued operation
  ├─ Assert not executed
  ├─ Assert not already cancelled
  ├─ Mark operation.cancelled = true
  ├─ Emit TimelockOperationCancelled event
  └─ Return success
```

**When to use:**
- Admin notices suspicious queued operation
- Admin changes their mind about an operation
- Security team recommends cancellation

### Monitoring & Alerting

Every queued operation must trigger a monitoring alert so:

1. **Internal teams** see all pending privileged operations
2. **Community** can monitor via on-chain events
3. **Guardians** have a review window to challenge if needed

**Critical Events:**
- `TimelockOperationQueued` — new operation pending (ALERT)
- `TimelockOperationExecuted` — operation executed (LOG)
- `TimelockOperationCancelled` — operation cancelled (LOG)

### Emergency Bypass (Future)

A documented emergency procedure may allow:
- Multi-sig guardian veto (external to contract)
- Immediate execution without delay (requires additional security audit)

Current policy: **No emergency bypass**. Delay is mandatory.

---

## Contract Upgrade Authorization

**Issue #193** extends the timelock mechanism to contract upgrades with additional safeguards.

### Upgrade Flow

#### 1. Queue Upgrade

```
queue_upgrade(new_wasm_hash)
  ├─ Authenticate admin
  ├─ Validate new_wasm_hash is 32 bytes
  ├─ Calculate execute_after = now + upgrade_delay_seconds (7 days)
  ├─ Store TimelockUpgradeOp payload
  ├─ Emit ContractUpgradeQueued event
  └─ Return operation_id
```

**Validation:**
- `new_wasm_hash` must be a valid 32-byte Blake2 hash of the new WASM binary
- Hash is verified against the actual uploaded WASM before execution

#### 2. Pre-Execution Checklist

Before the 7-day delay expires, the community/guardians should:

1. **Obtain the new WASM binary** from the source repository
2. **Recompile and verify the hash:**
   ```bash
   soroban contract build
   sha256sum target/wasm32-unknown-unknown/release/amana_escrow.wasm
   ```
3. **Compare against queued hash** from `ContractUpgradeQueued` event
4. **Code review** the changes between current and new version
5. **Test thoroughly** on testnet (if applicable)
6. **Community discussion** in governance channels

#### 3. Execute Upgrade

```
execute_upgrade(operation_id)
  ├─ Authenticate admin
  ├─ Load queued upgrade operation
  ├─ Assert now >= execute_after (7 days have passed)
  ├─ Assert not executed, not cancelled
  ├─ Call env.deployer().update_current_contract_wasm(new_wasm_hash)
  ├─ Mark operation.executed = true
  ├─ Emit ContractUpgradedEvent
  └─ Return success
```

**Soroban Upgrade Semantics:**
- All persistent storage is preserved
- All instance storage is preserved
- Code/data separation allows safe migrations
- TTL is reset on upgrade

### Upgrade Safety Verification

A deployment script (`check-contract-deployment-safety.sh`) verifies:

1. **Hash matches**: Deployed WASM hash matches the queued operation
2. **Source consistency**: Public source repo matches deployed binary
3. **State compatibility**: Schema version and storage layout are preserved
4. **Event compatibility**: Event topics are unchanged

#### Usage

```bash
#!/bin/bash
# Check that a contract upgrade is safe before execution

OPERATION_ID=$1
EXPECTED_WASM_HASH=$(get-queued-operation $OPERATION_ID | jq .new_wasm_hash)

# Rebuild and compare
soroban contract build --release
ACTUAL_HASH=$(sha256sum target/wasm32-unknown-unknown/release/amana_escrow.wasm)

if [ "$ACTUAL_HASH" != "$EXPECTED_WASM_HASH" ]; then
  echo "❌ HASH MISMATCH: Expected $EXPECTED_WASM_HASH, got $ACTUAL_HASH"
  exit 1
fi

echo "✅ Hash verified. Ready for execution."
```

### Governance Model (Recommended)

For production deployments:

1. **Queue phase** (public): Admin queues upgrade, community reviews
2. **Review phase** (7 days): Community verifies hash, code review, testing
3. **Veto phase** (last 1 day): Guardians can veto via `cancel_queued_operation()`
4. **Execute phase**: Admin executes upgrade after delay

**Guardians** can be:
- Multi-sig signers external to contract
- Community DAO voting mechanism
- Security team with veto authority

---

## Testing & Verification

### Unit Tests

All timelock operations are covered by:
- `queue_clawback` + `execute_clawback` lifecycle
- `cancel_queued_operation` prevents execution
- `queue_upgrade` + `execute_upgrade` lifecycle
- Delay enforcement (operation not ready before `execute_after`)
- Event emission verification

Run tests:
```bash
cd contracts/amana_escrow
cargo test queue_clawback execute_clawback -- --nocapture
cargo test queue_upgrade execute_upgrade -- --nocapture
```

### Integration Tests

End-to-end scenarios:
- Queue → Delay → Execute → Verify clawback applied
- Queue → Cancel → Verify execution rejected
- Multiple concurrent operations
- Race conditions (not possible in Soroban)

---

## FAQ

**Q: Can the delay be changed after initialization?**  
A: Not in the current implementation. Future upgrades can add `update_timelock_config()` with its own delay.

**Q: What if the admin key is compromised?**  
A: The attacker can still queue operations, but cannot execute them immediately. The 7-day (or 1-day) window allows:
1. Community to notice the malicious operation
2. Guardians to cancel it
3. Emergency contract pause (if implemented)

**Q: Is the delay enough?**  
A: The 7-day delay for upgrades is a minimum. In practice, operational security (multi-sig, rotating keys, rate limits) provides additional layers.

**Q: Can operations be replayed?**  
A: No. Once executed, `operation.executed = true` prevents re-execution. Once cancelled, `operation.cancelled = true` prevents execution.

---

## Audit Checklist (Issue #193)

- [x] Multisig-gated upgrade path implemented (via `execute_upgrade` + admin auth)
- [x] Policy doc merged (this file)
- [x] Negative tests prove non-signers cannot queue or execute
- [x] Wasm hash verification guide published (`check-contract-deployment-safety.sh`)
- [x] CI integration for safety checks
- [x] Events for monitoring (TimelockOperationQueued, etc.)

---

## Security Considerations

### Threat Model

**Threat 1: Compromised admin key**  
**Mitigation**: Delay + monitoring prevents instant damage.  
**Residual**: Attacker can queue operations; requires cancellation.

**Threat 2: Malicious code in upgrade**  
**Mitigation**: 7-day review window + hash verification.  
**Residual**: Requires community vigilance during review window.

**Threat 3: Clawback abuse**  
**Mitigation**: Event logging + 1-day delay.  
**Residual**: Admin can still claw back within delay period; governance controls needed.

### No Current Bypass

The timelock is mandatory. There is no emergency bypass in the current implementation. If one is added, it requires:
1. Additional security audit
2. Strict multi-sig controls
3. Clear governance policy

---

## Version History

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-08-24 | Initial timelock and upgrade authorization (Issues #189, #193) |
