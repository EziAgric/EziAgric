#![no_std]

#[cfg(test)]
mod tests;

/// Shared admin signer fixture for contract unit and integration tests (#108).
/// Available on native / test builds only; excluded from the WASM artifact.
#[cfg(not(feature = "wasm"))]
pub mod test_fixture;

/// Admin transaction payload builder — issue #98.
/// Provides strongly-typed helpers for constructing admin contract call arguments.
/// Available in test builds and as an `rlib` dependency for off-chain tooling.
pub mod admin_payload;

/// Event topic and field constants generated from the canonical schema
/// (`schemas/events/amana_escrow.events.json`). Tests assert the emitted shape
/// against these, so a topic or field rename that is not reflected in the
/// schema — and therefore not in the TypeScript decoder — fails here.
pub mod generated;

mod admin;
mod dispute;
pub mod errors;
pub mod events;
mod fees;
mod partial_delivery;
pub mod storage;
mod trade;
pub mod types;

pub use errors::*;
pub use events::*;
pub use fees::*;
pub use partial_delivery::PARTIAL_DELIVERY_DISPUTE_REASON;
pub use storage::*;
pub use types::*;

use soroban_sdk::contract;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Maximum byte length accepted for any caller-supplied hash / IPFS CID input.
/// Real IPFS CIDs (≤ ~62 bytes) and hex digests (64 bytes) fit comfortably; the
/// cap rejects malformed oversized payloads that would otherwise bloat
/// persistent storage and inflate read/write gas for every later access.
pub const MAX_HASH_LEN: u32 = 256;

/// Current on-chain persistent storage schema version. Bump this whenever the
/// persistent layout changes so a future upgrade can branch on
/// `get_schema_version()` and run the matching migration. See SECURITY.md.
pub const CURRENT_SCHEMA_VERSION: u32 = 1;

/// Event schema version, distinct from the storage schema version.
///
/// This constant is embedded in the `ClawbackExecutedEvent` (and any new event
/// type added after it) as a `schema_version` field so downstream listeners can
/// detect structural changes and apply the appropriate parser.
///
/// Policy:
/// - Bump when a **new field is added** to any event struct.
/// - Never remove or reorder existing fields on a bump — always additive.
/// - Old listeners that ignore unknown trailing fields remain compatible.
/// - Document every bump in `docs/event-schema-migration-plan.md`.
///
/// Events predating this constant (all v1 events) have a stable, locked shape
/// documented in `src/tests/event_schema_tests.rs`. They are not retrofitted
/// with this field to preserve backward compatibility with deployed listeners.
pub const EVENT_SCHEMA_VERSION: u32 = 1;

/// Maximum single-trade escrow value in stroops (i128). Set to 1 trillion cNGN
/// to guard against fat-finger amounts that would exhaust token supply.
pub const MAX_TRADE_VALUE: i128 = 1_000_000_000_000_i128;

/// Default cap on how many times one trade's delivery deadline may be extended
/// (#194). Without a cap a seller can extend indefinitely, locking the buyer's
/// capital in escrow with no exit — the extension itself requires both
/// signatures, but a buyer facing "extend or lose the goods" has no real
/// choice. Applies when the admin has not set an explicit `ExtensionPolicy`.
pub const DEFAULT_MAX_DEADLINE_EXTENSIONS: u32 = 3;

/// Default absolute cap, in seconds, on how far past its *original* deadline a
/// trade may be pushed (#194). Measured from the first deadline rather than the
/// current one, so many small extensions cannot outflank the limit that one
/// large extension would hit. 30 days.
pub const DEFAULT_MAX_TOTAL_EXTENSION_SECS: u64 = 30 * 24 * 60 * 60;

/// Upper bound the admin itself cannot exceed when configuring the extension
/// policy. A cap that can be raised without limit is not a cap; this bounds the
/// worst case an admin key compromise can impose on buyers. 365 days.
pub const EXTENSION_POLICY_CEILING_SECS: u64 = 365 * 24 * 60 * 60;

/// Upper bound on the configurable extension count, for the same reason.
pub const EXTENSION_POLICY_CEILING_COUNT: u32 = 12;

/// Default escrow value at or above which a dispute needs a mediator quorum
/// rather than one mediator's decision (#195). Only consulted when quorum is
/// enabled; see [`QuorumConfig::enabled`].
pub const DEFAULT_QUORUM_VALUE_THRESHOLD: i128 = 10_000_000_000_i128;

/// Default total vote weight that must back one outcome to resolve on quorum.
pub const DEFAULT_QUORUM_REQUIRED_WEIGHT: u32 = 3;

/// Default window, in seconds, from the first vote until fallback resolution
/// becomes available. Without a fallback a quorum that never assembles would
/// strand the escrow permanently — the opposite of the problem quorum solves.
/// 7 days.
pub const DEFAULT_QUORUM_VOTE_WINDOW_SECS: u64 = 7 * 24 * 60 * 60;

/// Default minimum weight that must have voted for fallback resolution to be
/// permitted once the window closes.
pub const DEFAULT_QUORUM_FALLBACK_MIN_WEIGHT: u32 = 2;

/// Weight assigned to a mediator with no explicit weight configured.
pub const DEFAULT_MEDIATOR_WEIGHT: u32 = 1;

/// Ceiling on any single mediator's vote weight. Bounds how far one mediator
/// can be favoured, so "quorum" cannot be quietly reduced to one signature.
pub const MAX_MEDIATOR_WEIGHT: u32 = 10;

/// Minimum allowed platform fee in basis points (0.01%).
pub const MIN_FEE_BPS: u32 = 1;
/// Maximum allowed platform fee in basis points (5%).
pub const MAX_FEE_BPS: u32 = 500;

/// Maximum number of trade ids accepted by one `get_trades` call (#351).
/// Bounds the read footprint of a single simulation so a dashboard page can
/// never push the call past the per-transaction ledger-read limits.
pub const MAX_TRADE_BATCH: u32 = 50;

/// Window, in seconds, the seller has to accept a buyer's partial-delivery
/// proposal before either party may escalate it to a dispute (#349). 3 days.
pub const PARTIAL_DELIVERY_ACCEPT_WINDOW_SECS: u64 = 3 * 24 * 60 * 60;

// ---------------------------------------------------------------------------
// Escrow Contract
//
// The `#[contractimpl]` surface is split across cohesive modules; see the
// module map in `docs/eziagric_contract_overview.md`:
//
//   admin.rs   — initialize, registries, pause, assets, timelock, clawback, upgrade
//   fees.rs    — fee rate, accrual/withdrawal, bps math helpers
//   trade.rs   — trade lifecycle, delivery artefacts and views
//   dispute.rs — disputes, mediator quorum, evidence
//   partial_delivery.rs — pro-rata settlement of partial shipments
//   storage.rs — DataKey and storage helpers
//   types.rs   — persistent #[contracttype] values
//   events.rs  — #[contractevent] definitions
//   errors.rs  — error codes
// ---------------------------------------------------------------------------

#[contract]
pub struct EscrowContract;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod test;
