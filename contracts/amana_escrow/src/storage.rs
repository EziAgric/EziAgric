//! Storage keys and low-level storage helpers.
//!
//! Every `DataKey` variant and the `NXTTRD` symbol are part of the on-chain
//! storage layout and must stay byte-for-byte identical across upgrades.
//! Append new variants at the end only.

use soroban_sdk::{Address, Env, Symbol, contracttype, symbol_short};

use crate::{EscrowContract, ReleaseSequence, Trade, TradeData, TradeEvent};

pub(crate) const NEXT_TRADE_ID: Symbol = symbol_short!("NXTTRD");
pub(crate) const INSTANCE_TTL_THRESHOLD: u32 = 50_000;
pub(crate) const INSTANCE_TTL_EXTEND_TO: u32 = 50_000;

#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum DataKey {
    Trade(u64),
    /// Ordered list of TradeEvent records for a given trade, appended on each state transition.
    TradeHistory(u64),
    Initialized,
    Admin,
    CngnContract,
    FeeBps,
    Treasury,
    /// Legacy single-mediator slot — used by set_mediator() / require_mediator().
    Mediator,
    /// Per-address registry slot. Stores `true` when an address is an approved mediator.
    /// Used by add_mediator() / remove_mediator() / is_mediator().
    MediatorRegistry(Address),
    CancelRequest(u64),
    /// Stores the most-recent evidence hash submitted by each party (legacy).
    Evidence(u64, Address),
    /// Stores the DisputeRecord created by initiate_dispute() for a given trade.
    DisputeData(u64),
    /// Stores the list of all evidence records submitted for a trade.
    EvidenceList(u64),
    /// Stores the single VideoProofRecord for a trade (one per trade, immutable once set).
    VideoProof(u64),
    /// Stores the single DeliveryManifestRecord for a trade.
    Manifest(u64),
    /// Address of the source token contract (e.g., NGN) used for path payments.
    SourceToken,
    /// Stores active path payment intents pending conversion.
    PathPaymentIntent(u64),
    /// Stores release sequencing timestamps for a trade.
    ReleaseSequence(u64),
    /// Aggregate number of trades ever created.
    TotalTrades,
    /// Aggregate number of disputes ever initiated.
    TotalDisputes,
    /// Aggregate number of disputes ever resolved.
    TotalResolved,
    /// Cumulative platform fees accrued from trade completions and dispute
    /// resolutions. Admin may withdraw any portion via `withdraw_fees()`.
    AccruedFees,
    /// Monotonic storage-schema version, written at initialize() and read via
    /// get_schema_version(). Enables forward-compatible migrations without
    /// disturbing any existing key. Appended last so the XDR encoding of every
    /// pre-existing variant is unchanged (variants are keyed by name).
    SchemaVersion,
    /// Cumulative amount clawed back from a given trade by the admin.
    /// Used to prevent over-clawback: all partial clawbacks summed must not
    /// exceed the original escrowed amount.
    ClawbackTotal(u64),
    /// Stores the timelock configuration (delay periods for different operation types).
    TimelockConfig,
    /// Stores a queued privileged operation awaiting execution after a delay.
    TimelockOperation(u64),
    /// Monotonic counter for timelock operation IDs.
    NextTimelockId,
    /// Global pause flag — when true, all state-changing entrypoints are blocked.
    Paused,
    /// Per-address guardian registry. Stores `true` when the address is an authorized guardian.
    GuardianRegistry(Address),
    /// Allowlisted asset contract address for multi-asset escrow support.
    AllowedAsset(Address),
    /// Per-asset decimal precision (u32), stored alongside AllowedAsset.
    AssetDecimals(Address),
    /// Admin-configured `ExtensionPolicy`. Absent until an admin sets one, in
    /// which case the DEFAULT_MAX_* constants apply (#194).
    ExtensionPolicy,
    /// Number of deadline extensions already applied to a trade (#194).
    /// Absent means zero.
    ExtensionCount(u64),
    /// A trade's first deadline, captured on its first extension. The lifetime
    /// cap is measured from here so that repeated small extensions cannot
    /// outflank a limit that one large extension would hit (#194).
    OriginalDeadline(u64),
    /// Admin-configured `QuorumConfig`. Absent until an admin sets one, in
    /// which case quorum is disabled and every dispute uses the single-mediator
    /// path (#195).
    QuorumConfig,
    /// Accumulated `QuorumState` for a disputed trade (#195).
    DisputeVotes(u64),
    /// Per-mediator vote weight. Absent means `DEFAULT_MEDIATOR_WEIGHT` (#195).
    MediatorWeight(Address),
    /// Deployment-time enablement switch for `admin_clawback` (Issue #113).
    /// Absent (post-upgrade default) is treated as enabled to preserve
    /// existing behavior; an admin can explicitly disable/re-enable via
    /// `set_clawback_enabled()` to stage a rollout or freeze the feature.
    ClawbackEnabled,
    /// Pending `PartialDeliveryProposal` for a trade (#349). Absent when no
    /// partial delivery has been proposed or once it has been settled.
    PartialDelivery(u64),
}

// ---------------------------------------------------------------------------
// Internal storage helpers (not exported as contract functions)
// ---------------------------------------------------------------------------

impl EscrowContract {
    pub(crate) fn bump_instance_ttl(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND_TO);
    }

    /// Panics with "contract is paused" when the global pause flag is set.
    /// Call this at the top of every state-changing entrypoint.
    pub(crate) fn assert_not_paused(env: &Env) {
        let paused: bool = env
            .storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false);
        assert!(!paused, "contract is paused");
    }

    pub(crate) fn default_release_sequence(trade: &Trade) -> ReleaseSequence {
        ReleaseSequence {
            trade_id: trade.trade_id,
            created_at: trade.created_at,
            funded_at: trade.funded_at,
            manifest_submitted_at: None,
            delivered_at: trade.delivered_at,
            disputed_at: None,
            released_at: None,
            resolved_at: None,
            cancelled_at: None,
            expired_at: None,
        }
    }

    pub(crate) fn update_release_sequence(env: &Env, trade: &Trade, updater: fn(&mut ReleaseSequence, u64)) {
        let key = DataKey::ReleaseSequence(trade.trade_id);
        let mut sequence: ReleaseSequence = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| Self::default_release_sequence(trade));
        updater(&mut sequence, env.ledger().timestamp());
        env.storage().persistent().set(&key, &sequence);
    }

    /// Load a trade from persistent storage, unpacking the versioned `TradeData` envelope.
    pub(crate) fn load_trade(env: &Env, key: &DataKey) -> Trade {
        let data: TradeData = env
            .storage()
            .persistent()
            .get(key)
            .expect("Trade not found");
        match data {
            TradeData::V0(t) => t,
        }
    }

    /// Save a trade to persistent storage, wrapping it in the `TradeData::V0` envelope.
    pub(crate) fn save_trade(env: &Env, key: &DataKey, trade: &Trade) {
        env.storage()
            .persistent()
            .set(key, &TradeData::V0(trade.clone()));
    }

    /// Appends a TradeEvent to the persistent history for trade_id.
    pub(crate) fn record_trade_event(env: &Env, trade_id: u64, event_type: &str, actor: Address, data: &str) {
        let key = DataKey::TradeHistory(trade_id);
        let mut history: soroban_sdk::Vec<TradeEvent> = env
            .storage()
            .persistent()
            .get(&key)
            .unwrap_or_else(|| soroban_sdk::Vec::new(env));
        history.push_back(TradeEvent {
            event_type: soroban_sdk::String::from_str(env, event_type),
            timestamp: env.ledger().timestamp(),
            actor,
            data: soroban_sdk::String::from_str(env, data),
        });
        env.storage().persistent().set(&key, &history);
    }
}
