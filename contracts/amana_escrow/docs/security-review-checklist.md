# Amana Escrow — Contract E2E Security Review Checklist

> Issue #112 — Security review checklist for the `admin_clawback` function and
> any future contract admin functions.

This checklist must be completed and signed off by a reviewer before any PR
that adds or modifies a contract admin function is merged. Attach a copy of
this completed checklist to the PR description or link to a filled-in version
in the PR comments.

---

## How to use this checklist

1. Copy the checklist sections below into your PR description or a linked
   document.
2. Work through every item. Mark items `[x]` when satisfied, `[~]` when
   not applicable (with a brief note), or `[!]` when a concern has been raised
   that needs discussion before sign-off.
3. At least **one reviewer** must sign off in the
   [Reviewer Sign-Off](#reviewer-sign-off) section before the PR can be merged.
4. For any item marked `[!]`, create a follow-up issue and link it in the
   notes column.

---

## Section 1 — Access Control

Access control is the first and most critical layer. Every admin function must
be callable **only** by the designated admin address.

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1.1 | The function calls `admin.require_auth()` at the very start of the entry point, before any state reads or writes. | `[ ]` | |
| 1.2 | The admin address is read from `env.storage().instance()` (`DataKey::Admin`) and compared against the caller — not passed as a caller-supplied argument. | `[ ]` | |
| 1.3 | The function returns a clear, non-generic error if a non-admin caller invokes it (e.g. `"admin_clawback: caller is not the admin"`). | `[ ]` | |
| 1.4 | The access control test file (`tests/clawback_access_control_tests.rs` or equivalent) covers all six roles: admin ✅, buyer ❌, seller ❌, mediator ❌, treasury ❌, stranger ❌. | `[ ]` | |
| 1.5 | No other role (buyer, seller, mediator) can impersonate the admin or invoke the function via a multi-step call chain. | `[ ]` | |
| 1.6 | The `initialize()` guard (`DataKey::Initialized`) prevents re-initialization and therefore prevents the admin from being overwritten after deployment. | `[ ]` | |
| 1.7 | If the admin key is rotated in the future, the rotation function itself requires `admin.require_auth()` from the **current** admin. | `[ ]` | N/A if rotation is not implemented |

---

## Section 2 — State Machine & Trade Status Gates

Admin functions that operate on a trade must check the trade's current status
and reject calls that would put the contract into an invalid state.

| # | Item | Status | Notes |
|---|------|--------|-------|
| 2.1 | The function validates `trade.status == Funded` (or the required status) before performing any action. | `[ ]` | |
| 2.2 | The function returns a descriptive error for trades in unexpected statuses (e.g. `"admin_clawback: trade is not in Funded status"`). | `[ ]` | |
| 2.3 | The function does **not** allow re-entry on an already-settled trade (`Completed`, `Cancelled`, `Resolved`). | `[ ]` | |
| 2.4 | After the function executes, the trade's `status` is updated to the correct terminal state (e.g. `Cancelled` for a clawback). | `[ ]` | |
| 2.5 | State machine tests (`tests/state_machine_fuzz_tests.rs` or property tests) cover the new function's valid and invalid entry states. | `[ ]` | |
| 2.6 | The new terminal status is correctly reflected in `get_trade()`. | `[ ]` | |

---

## Section 3 — Event Emission & Integrity

Events are the audit trail. Every state-changing admin action must emit a
corresponding event with sufficient information to reconstruct what happened.

| # | Item | Status | Notes |
|---|------|--------|-------|
| 3.1 | The function emits a dedicated event (e.g. `AdminClawbackEvent`) for every successful execution. | `[ ]` | |
| 3.2 | The event topic symbol is a unique 6-char string registered in the event table in [`upgrade-considerations.md`](./upgrade-considerations.md). | `[ ]` | |
| 3.3 | The event payload includes: `trade_id`, the affected amount, the recipient address, and a `reason_hash`. | `[ ]` | |
| 3.4 | No sensitive data (private keys, PII) is included in the event payload. | `[ ]` | |
| 3.5 | The event topic symbol is **not** reused from any existing event symbol in the table. | `[ ]` | |
| 3.6 | Event emission tests (`tests/event_emission_tests.rs`) cover the new event — verifying topic symbol, payload fields, and that the event fires exactly once per valid call. | `[ ]` | |
| 3.7 | The backend event listener (`eventListener.service.ts`) has a handler registered for the new topic symbol. | `[ ]` | |
| 3.8 | ABI compatibility tests (`abi.compatibility.test.ts`) have been updated to include the new event. | `[ ]` | |

---

## Section 4 — Math Invariants & Fund Conservation

All arithmetic in contract functions must be safe against overflow, underflow,
and fund duplication or loss.

| # | Item | Status | Notes |
|---|------|--------|-------|
| 4.1 | All arithmetic uses checked operations (Rust's `checked_add`, `checked_mul`, `checked_sub`, or Soroban's `i128` which panics on overflow). No wrapping arithmetic (`wrapping_*`) is used. | `[ ]` | |
| 4.2 | The function does not perform arithmetic on `trade.amount` beyond a single verbatim read and transfer (no multiplications, no fee deductions, no loss-ratio splits for clawback). | `[ ]` | |
| 4.3 | Pre-condition invariant: `clawback_amount > 0` — the function rejects zero-value calls. | `[ ]` | |
| 4.4 | Pre-condition invariant: `clawback_amount <= trade.amount` — the function cannot transfer more than was escrowed. | `[ ]` | |
| 4.5 | Post-condition invariant: the transferred amount equals `trade.amount` — no funds are silently lost or retained by the contract. | `[ ]` | |
| 4.6 | The function does **not** apply `buyer_loss_bps` / `seller_loss_bps` to the clawback amount. A clawback is a full refund, not a dispute settlement. | `[ ]` | |
| 4.7 | Invariant tests (`tests/clawback_invariant_tests.rs`) cover: 1-stroop edge case, `MAX_TRADE_VALUE` edge case, and multi-trade isolation (clawback on trade A does not affect trade B). | `[ ]` | |
| 4.8 | Property tests (`tests/property_tests.rs`) include a fund-conservation invariant covering the clawback path. | `[ ]` | |

---

## Section 5 — Input Validation

All caller-supplied inputs must be validated before use.

| # | Item | Status | Notes |
|---|------|--------|-------|
| 5.1 | `trade_id` is validated to refer to an existing trade (`load_trade` returns an error or panics clearly if the trade does not exist). | `[ ]` | |
| 5.2 | `reason_hash` (or equivalent audit field) is validated as non-empty. | `[ ]` | |
| 5.3 | Any string inputs are bounded by `MAX_HASH_LEN` (256 bytes) to prevent storage bloat. | `[ ]` | |
| 5.4 | Fuzz / hardening tests (`tests/input_hardening_tests.rs`) cover: empty `reason_hash`, oversized strings, invalid `trade_id`. | `[ ]` | |
| 5.5 | The function does not accept or trust any amount parameter from the caller — the amount is read entirely from on-chain trade storage. | `[ ]` | |

---

## Section 6 — Token Transfer Safety

Calls to external token contracts are potential reentrancy and failure points.

| # | Item | Status | Notes |
|---|------|--------|-------|
| 6.1 | The token `transfer` is called **after** all state mutations (status update, history record, event emission) to follow checks-effects-interactions. | `[ ]` | |
| 6.2 | The token `transfer` call uses the `token_id` stored in `DataKey::SourceToken` (or `DataKey::CngnContract`) — never a caller-supplied token address. | `[ ]` | |
| 6.3 | The transfer recipient is `trade.buyer` read from on-chain storage — never a caller-supplied address. | `[ ]` | |
| 6.4 | Transfer failure causes the entire transaction to revert (Soroban's default behaviour — confirm no `try_call` suppresses errors). | `[ ]` | |
| 6.5 | No second token transfer is performed in the same call (no fee on clawback — fees are only collected in `release_funds`). | `[ ]` | |

---

## Section 7 — Audit Trail & History

Admin actions must leave a permanent, tamper-evident audit trail.

| # | Item | Status | Notes |
|---|------|--------|-------|
| 7.1 | The function writes a history record to the trade's on-chain history log (via `push_history` or equivalent). | `[ ]` | |
| 7.2 | The history record includes: timestamp (`env.ledger().timestamp()`), actor (admin address), action type, and amount. | `[ ]` | |
| 7.3 | The history record is **not** writable by any non-admin path (it must only be appended by the function itself). | `[ ]` | |
| 7.4 | History tests (`tests/trade_history_tests.rs`) include a case for the clawback history record. | `[ ]` | |

---

## Section 8 — Upgrade Compatibility

New admin functions must not break the upgrade path.

| # | Item | Status | Notes |
|---|------|--------|-------|
| 8.1 | Any new `DataKey` variants are **appended** to the end of the enum — not inserted in the middle. | `[ ]` | |
| 8.2 | `CURRENT_SCHEMA_VERSION` has been bumped if and only if the persistent storage layout has changed. | `[ ]` | |
| 8.3 | Migration logic (if any) is gated on `get_schema_version()` and is idempotent. | `[ ]` | |
| 8.4 | Upgrade simulation passes: `./scripts/simulate-contract-upgrade.sh` exits 0. | `[ ]` | |
| 8.5 | The safe upgrade guide (`docs/safe-upgrade-guide.md`) has been updated with release notes for this change. | `[ ]` | |

---

## Section 9 — Backend Integration

| # | Item | Status | Notes |
|---|------|--------|-------|
| 9.1 | `backend/src/services/contract.service.ts` has been updated to call the new function and handle its error codes. | `[ ]` | |
| 9.2 | `backend/src/services/contractClawbackError.service.ts` maps the new contract error codes to appropriate HTTP error responses. | `[ ]` | |
| 9.3 | Admin route (`backend/src/routes/admin.contract.routes.ts`) has been updated if a new HTTP endpoint is exposed. | `[ ]` | |
| 9.4 | The new backend code is covered by tests in `backend/src/__tests__/admin.contract.routes.test.ts` or equivalent. | `[ ]` | |
| 9.5 | The OpenAPI spec (`backend/src/docs/openapi.yaml`) has been updated if a new API endpoint is exposed. | `[ ]` | |

---

## Reviewer Sign-Off

This section must be completed by at least one reviewer before the PR is merged.

| Reviewer | Role | Sign-off | Date | Notes |
|----------|------|----------|------|-------|
| | | `[ ] Approved` / `[ ] Approved with conditions` / `[ ] Rejected` | | |
| | | `[ ] Approved` / `[ ] Approved with conditions` / `[ ] Rejected` | | |

### Sign-off declaration

By signing off, the reviewer confirms that:

1. They have worked through every applicable item in this checklist.
2. All `[!]` items have either been resolved or have a linked follow-up issue.
3. They are satisfied that the change does not introduce access-control bypasses,
   arithmetic vulnerabilities, fund loss/duplication risks, or event integrity issues.
4. The upgrade path has been validated (Section 8 is complete).

---

## Linked issues and follow-ups

| Issue | Description | Status |
|-------|-------------|--------|
| #111 | Contract migration safe upgrade docs | Closed by this PR |
| #112 | Contract E2E security review checklist | Closed by this PR |
| | | |

---

## References

- [`admin_clawback_vesting_math.md`](./admin_clawback_vesting_math.md) — vesting
  math and invariant documentation for `admin_clawback`.
- [`safe-upgrade-guide.md`](./safe-upgrade-guide.md) — step-by-step upgrade
  procedure and pre-upgrade checklist.
- [`upgrade-considerations.md`](./upgrade-considerations.md) — storage layout,
  event symbol registry, and schema versioning.
- [`contracts/amana_escrow/tests/clawback_access_control_tests.rs`](../tests/clawback_access_control_tests.rs) —
  access control test suite.
- [`contracts/amana_escrow/tests/clawback_invariant_tests.rs`](../tests/clawback_invariant_tests.rs) —
  arithmetic invariant tests.
- [`docs/threat-model.md`](../../../docs/threat-model.md) — full system threat
  model.
- [`scripts/simulate-contract-upgrade.sh`](../../../scripts/simulate-contract-upgrade.sh) —
  local upgrade simulation script.
