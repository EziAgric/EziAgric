# ADR-010: Event Bus for Trade State Change Propagation

## Status

Proposed. Written from the repository as it stands at this commit.

Parts marked **(in tree)** are present in this checkout. Parts marked
**(referenced, not in tree)** are described in existing docs but their code is
not present here. Maintainers should resolve the open questions at the end
before moving this to Accepted.

## Context

Trade state changes originate on chain. The Soroban escrow contract emits
events for every state transition (`contracts/amana_escrow/src/events.rs`), and
the backend keeps a read-optimized Postgres mirror of those trades
([ADR-003](./ADR-003-offchain-vs-onchain-data-partitioning.md)).

Three constraints shape the design:

1. **Soroban RPC is pull-based.** The backend cannot be pushed events. It must
   poll `getEvents`.
2. **Chain events are final.** A failed downstream handler cannot roll back the
   ledger. Retries and dead-lettering must be owned by the backend.
3. **Consumers have different failure costs.** Mirror updates must be atomic
   with the `Trade` row. Notifications and webhooks are not trust-critical, and
   a slow webhook must not stall mirror updates.

We need to decouple "read the chain" from "react to the chain" without losing
events across restarts and without coupling chain ingest to every consumer.

## Alternatives considered

1. **Inline handling in the poller.** The listener calls each handler directly.
   Simple, but a crash mid-batch loses work unless the cursor and handler
   effects are atomic, and there is no retry queue or dead-letter path.
   Rejected.

2. **Synchronous calls from the listener to each consumer.** Chain ingest
   latency and availability then depend on every downstream service. One slow
   webhook stalls the mirror. Rejected.

3. **External message broker (Kafka, SQS, RabbitMQ, Redis Streams).** Durable
   and decoupled, but it adds an operated service and a second failure domain.
   It also creates a second consistency boundary: the `Trade` update and the
   publish cannot share a transaction without an outbox anyway. Rejected for
   current scale. Revisit if consumers move out of process.

4. **In-process `EventEmitter` fed after commit.** Fast, but in memory. Events
   are lost on restart and there is no dead-letter path. Rejected as the durable
   path.

**Chosen:** a transactional outbox in Postgres (`ChainEventOutbox`) with
dedup via `ProcessedEvent`. Events are written durably from the poller, and
handlers consume them with retry and dead-letter states. The rationale above is
inferred from the schema and from [ADR-003](./ADR-003-offchain-vs-onchain-data-partitioning.md).
It has not been confirmed with the maintainers.

## Decision

### Ingest and persistence

- **(referenced, not in tree)** An `EventListener` polls Soroban RPC for
  contract events, as described in ADR-003.
- **(in tree, schema only)** Each event is persisted to `ChainEventOutbox`.
  The unique key `(ledgerSequence, contractId, eventId)` makes inserts
  idempotent. The migration is `20260427000001_add_chain_event_outbox`.
- **(in tree, schema only)** `ProcessedEvent` records handled events under the
  same key, so a restart does not reprocess history.

### Delivery state machine

`ChainEventOutbox.status` is `PENDING → PROCESSED`, or
`PENDING → RETRYING → … → DEAD_LETTER`. Retries use `attempts` and
`nextAttemptAt` with backoff. `lastError`, `deadLetteredAt` and `processedAt`
record the outcome.

The attempt threshold and backoff schedule are not defined in this checkout.

### Handlers

- Mirror updates run inside an atomic Prisma `$transaction` guarded by
  `Trade.version`, so concurrent writers cannot clobber each other (ADR-003).
- Delivery is **at least once**. Every handler must be idempotent, using
  `ProcessedEvent` plus the `Trade.version` guard.
- **(referenced, not in tree)** Notification dispatch is intended to consume
  from the outbox as an independent handler. I did not find this in code. The
  only match for "Notification dispatch worker" is a job description in
  `backend/src/services/jobHeartbeat.service.ts`, which is unrelated to trades.

### Event schema versioning

The contract event schema is the contract between the emitter and every
consumer. Consumers deploy independently of the contract, so old listeners must
keep working against new emitters. The rules are defined in
[docs/event-schema.md](../event-schema.md):

- **Additive only.** New fields go at the end. Never remove, reorder or retype a
  field.
- **Bump both versions together.** `schemaVersion` in the schema JSON and
  `EVENT_SCHEMA_VERSION` in the contract change in the same commit.
- **Never reuse a topic.** A retired topic stays retired.
- **Keep legacy decoder aliases** until no deployed contract emits the old
  symbols.
- **Unmapped events decode to `null` and are skipped.** This is deliberate. It
  is not a failure.
- **Generated clients are gated in CI.** `scripts/codegen-events.mjs --check`
  fails on drift, and an uncommitted regenerate diff fails the build.

**(referenced, not in tree)** The source-of-truth file
`schemas/events/amana_escrow.events.json` is referenced by
`docs/event-schema.md`, but the `schemas/` directory is absent from this
checkout.

## Consequences

**Positive**

- Events survive restarts, because the outbox and dedup are durable.
- Retries and dead letters are visible in the database.
- The mirror and notifications fail independently.
- Schema drift between contract and backend is caught in CI.

**Negative**

- Latency is bounded below by the polling interval.
- Postgres carries the bus load. This is acceptable at current scale.
- Delivery is at least once, so every handler must be idempotent.
- The outbox grows without bound. No retention or pruning policy is defined.
- Ordering is guaranteed only per trade, through the `Trade.version` guard. There
  is no global ordering.

## Guardrails for contributors

- Do not fan out trade state changes in memory when the change must survive a
  restart.
- Do not call notification or webhook endpoints inline from the chain listener.
- Do not change an existing event's fields or topic. Follow the versioning rules
  above.

## Open questions

1. Where is the `EventListener` / outbox writer? It is not in this checkout.
2. Does notification dispatch consume `ChainEventOutbox`, or is it wired
   another way?
3. Is `schemas/events/amana_escrow.events.json` missing from the repo, or
   stored elsewhere?
4. What are the max-attempts threshold, backoff schedule, and outbox
   retention policy?
