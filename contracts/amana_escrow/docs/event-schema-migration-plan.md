# Contract Event Schema Migration Plan

**Issue:** #96 — Add contract schema migration plan for new event type  
**Status:** Active  
**Last updated:** 2026-07-30

---

## Overview

This document describes the migration plan and coordination requirements for introducing
new contract event types (or adding fields to existing ones) to the Amana Escrow Soroban
contract. It covers the `ClawbackExecutedEvent` introduced in release v1.1 as the first
worked example.

---

## 1. The Problem

The Amana backend event listener (`eventListener.service.ts`) and any third-party
indexers subscribe to on-chain contract events by topic symbol. Because Soroban event
topics and payloads are encoded as XDR, a structural change to an event — even an
additive one such as appending a new field — can break listeners that assume a fixed
field count or that decode positionally.

Two failure modes exist:
1. **New topic, no listener** — the backend silently ignores the event; trade state
   may not be updated in the off-chain DB.
2. **Existing topic, new field** — a strict decoder panics or silently misreads all
   fields that come after the insertion point.

---

## 2. Versioning Policy

### 2.1 Storage schema version (`CURRENT_SCHEMA_VERSION`)

Tracked in `src/lib.rs`. Governs the persistent storage layout of `TradeData`,
`DataKey`, and related structs. See `SECURITY.md` for upgrade instructions.

### 2.2 Event schema version (`EVENT_SCHEMA_VERSION`)

Tracked in `src/lib.rs` alongside `CURRENT_SCHEMA_VERSION`. This is an independent
counter embedded as the `schema_version: u32` field **in every new event struct**
introduced after it was defined. Events predating this constant (`TradeCreatedEvent`,
`TradeFundedEvent`, etc.) have a locked shape and are **never modified** — breaking
backward compatibility for existing listeners is unacceptable.

| Constant | Current value | When to bump |
|---|---|---|
| `CURRENT_SCHEMA_VERSION` | 1 | New persistent storage key or struct layout change |
| `EVENT_SCHEMA_VERSION` | 1 | New field added to any event struct that carries it |

**Rule:** Never remove or reorder existing fields on a bump. Only append. Old listeners
that discard unknown trailing fields remain compatible.

---

## 3. Migration Steps — Adding a New Event Type

The following ordered checklist applies to any new event or field addition:

### Step 1: Contract side (this repository)

1. Define the new event struct in `src/lib.rs` using `#[contractevent(topics = ["SYMBOL"])]`.
   - Include `schema_version: u32` and populate it with `EVENT_SCHEMA_VERSION`.
   - Choose a topic symbol that is ≤ 9 characters and does not conflict with existing topics.
   - Add a new `DataKey` variant if the event requires new persistent storage.
2. Implement the entry point that emits the event.
3. Add a new entry in `DataKey` **at the end** of the enum (XDR encoding is positional).
4. Update `src/tests/event_schema_tests.rs`:
   - Add a topic-schema test: `test_event_schema_<name>`.
   - Add a payload-count test: `<name>_event_must_have_n_payload_fields`.
   - Add a `schema_version` presence test: `<name>_has_schema_version`.
5. Add integration tests in `tests/<name>_tests.rs` registered in `Cargo.toml`.
6. Bump `CURRENT_SCHEMA_VERSION` **only if** persistent storage layout changed.
7. Update `docs/event-schema-migration-plan.md` (this file) under §6.

### Step 2: Backend coordination

1. Add the new topic symbol to `backend/src/types/events.ts` (`ContractEventType`).
2. Implement a handler in `backend/src/services/eventHandlers.ts`.
3. Register the handler in `backend/src/services/eventListener.service.ts`.
4. Write backend tests for the new handler in
   `backend/src/__tests__/eventHandlers.test.ts`.
5. Update `docs/event-flow.md` to list the new event in the status-transition table.

### Step 3: Coordinated release

Because the contract is immutable once deployed, the recommended rollout order is:

```
1. Deploy updated backend with the new handler (listening but not yet receiving events)
2. Deploy updated contract (starts emitting the new event)
3. Verify via logs/metrics that the backend receives and processes the new events
4. Tag the release
```

Deploying the contract before updating the backend results in unhandled events that
are silently dropped. The reverse (backend first) is safe because the new handler sits
idle until the contract is deployed.

---

## 4. Backward Compatibility

### 4.1 Old contract → new backend

New backend handlers must gracefully handle missing events from older contract versions
by registering only if `schema_version` (where present) matches a supported range.
Older events without a `schema_version` field are treated as version 1.

### 4.2 New contract → old backend

Old backend listeners simply do not register a handler for the new topic symbol. The
event is polled and discarded without error. Trade state in the off-chain DB is
unaffected unless the new event carries status-transition semantics, in which case the
transition goes unrecorded until the backend is updated (planned downtime window).

### 4.3 Field additions to existing versioned events

When `EVENT_SCHEMA_VERSION` is bumped:
- Old parsers that stop reading at the previous field count continue to work if the
  new fields are **appended at the end** (XDR map entries are ordered by key name, so
  appending alphabetically-last fields is required).
- New parsers should check `schema_version` and read extra fields only when
  `schema_version >= N`.

---

## 5. ClawbackExecutedEvent — Worked Example

**Topic:** `CLWBCK`  
**Contract method:** `admin_clawback(trade_id, clawback_amount, destination)`  
**Introduced:** v1.1 (issue #94 / #96)

### 5.1 Payload fields

| Field | Type | XDR sort position | Notes |
|---|---|---|---|
| `admin` | `Address` | 0 | admin address that called `admin_clawback` |
| `clawback_amount` | `i128` | 1 | amount removed from escrow |
| `destination` | `Address` | 2 | where clawed-back funds went |
| `remaining_amount` | `i128` | 3 | escrow balance after clawback |
| `schema_version` | `u32` | 4 | always `EVENT_SCHEMA_VERSION` = 1 |
| `trade_id` | `u64` | 5 | the trade this clawback applies to |

Total payload fields: **6**

### 5.2 Backend handler (pseudocode)

```typescript
async function handleClawbackExecuted(event: ContractEvent): Promise<void> {
  const { trade_id, clawback_amount, remaining_amount, destination, schema_version } =
    decodeClawbackEvent(event);

  await prisma.trade.update({
    where: { contractTradeId: String(trade_id) },
    data: {
      clawbackAmount: BigInt(clawback_amount),
      clawbackTotal: { increment: BigInt(clawback_amount) },
      amount: BigInt(remaining_amount),
      // Only transition to CANCELLED when fully clawed back
      ...(remaining_amount === 0n ? { status: 'CANCELLED' } : {}),
    },
  });
}
```

### 5.3 Migration checklist status

| Step | Status |
|---|---|
| Contract: `ClawbackExecutedEvent` struct defined | ✅ |
| Contract: `admin_clawback` entry point | ✅ |
| Contract: `get_clawback_total` view | ✅ |
| Contract: `DataKey::ClawbackTotal` | ✅ |
| Contract: event_schema_tests coverage | ✅ |
| Contract: partial_clawback_tests.rs | ✅ |
| Backend: `ContractEventType.ClawbackExecuted` | ⬜ pending |
| Backend: `handleClawbackExecuted` handler | ⬜ pending |
| Backend: eventListener registration | ⬜ pending |
| Backend: handler tests | ⬜ pending |
| docs/event-flow.md updated | ⬜ pending |
| Coordinated deployment performed | ⬜ pending |

---

## 6. Event Schema Changelog

| Version | Change | Affected events |
|---|---|---|
| 1 (baseline) | All original lifecycle events (`TRDCRT`, `TRDFND`, `DELCNF`, `RELSD`, `DISINI`, `DISRES`, `EVDSUB`, `VIDPRF`, `MNFST`, `MEDADD`, `MEDREM`, `TRDCAN`, `UPGRAD`, `PTHINT`, `PTHPAY`) | shape locked, no version field |
| 1 (v1.1) | `ClawbackExecutedEvent` introduced with `schema_version = 1` field | `CLWBCK` (new) |

---

## 7. Testing Requirements

Every migration requires at minimum:

1. **Topic schema test** — asserts the topic symbol is exactly the expected string.
2. **Payload count test** — asserts the event data contains exactly N fields.
3. **schema_version presence test** — asserts `schema_version = EVENT_SCHEMA_VERSION`.
4. **Backward parse test** — a listener that stops reading at N−1 fields (pre-bump)
   must still decode correctly when receiving a post-bump event.
5. **Integration test** — the full contract function call emits the event with correct
   values, and any state changes (e.g., `ClawbackTotal`) are correctly persisted.

All tests are located in:

- `contracts/amana_escrow/src/tests/event_schema_tests.rs` — schema/topic tests
- `contracts/amana_escrow/tests/partial_clawback_tests.rs` — integration tests

---

## 8. References

- `contracts/amana_escrow/src/lib.rs` — event struct definitions
- `contracts/amana_escrow/SECURITY.md` — upgrade and storage migration guide
- `docs/event-flow.md` — end-to-end event architecture
- `backend/src/types/events.ts` — backend event type registry
- `backend/src/services/eventHandlers.ts` — backend event handlers
