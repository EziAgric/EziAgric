//! Dispute lifecycle: initiation, single-mediator and quorum resolution,
//! fallback resolution and evidence submission.

use soroban_sdk::{Address, Bytes, Env, String, Vec, contractimpl, token};

use crate::*;

#[contractimpl]
impl EscrowContract {
    // -----------------------------------------------------------------------
    // Dispute resolution
    // -----------------------------------------------------------------------

    /// Formally initiate a dispute on a funded trade, recording the reason on-chain.
    ///
    /// Either the buyer or the seller may call this while the trade is `Funded`.
    /// Calling this:
    ///   - Transitions the trade to `TradeStatus::Disputed` (freezing the escrow)
    ///   - Persists a `DisputeRecord` under `DataKey::DisputeData(trade_id)`
    ///   - Emits a `DisputeInitiated` event containing the trade ID, initiator,
    ///     and the supplied `reason_hash`
    ///
    /// `reason_hash` should be an IPFS CID or the SHA-256 hex digest of a
    /// dispute brief so the full content lives off-chain but is committed here.
    pub fn initiate_dispute(env: Env, trade_id: u64, initiator: Address, reason_hash: String) {
        initiator.require_auth();
        assert!(!reason_hash.is_empty(), "reason_hash must not be empty");
        assert!(
            reason_hash.len() <= MAX_HASH_LEN,
            "reason_hash exceeds max length"
        );

        let key = DataKey::Trade(trade_id);
        let mut trade: Trade = Self::load_trade(&env, &key);

        assert!(
            matches!(trade.status, TradeStatus::Funded),
            "Trade must be in Funded status to initiate a dispute"
        );
        assert!(
            initiator == trade.buyer || initiator == trade.seller,
            "Only the buyer or seller can initiate a dispute"
        );

        let now = env.ledger().timestamp();

        // Persist the structured dispute record for mediator look-up
        let record = DisputeRecord {
            initiator: initiator.clone(),
            reason_hash: reason_hash.clone(),
            disputed_at: now,
        };
        env.storage()
            .persistent()
            .set(&DataKey::DisputeData(trade_id), &record);

        // Lock the trade in Disputed state
        trade.status = TradeStatus::Disputed;
        trade.updated_at = now;
        Self::save_trade(&env, &key, &trade);
        Self::update_release_sequence(&env, &trade, |sequence, at| {
            sequence.disputed_at = Some(at);
        });

        // Increment aggregate dispute counter
        let total_disputes: u64 = env
            .storage()
            .instance()
            .get(&DataKey::TotalDisputes)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalDisputes, &(total_disputes + 1));

        // Emit on-chain event
        DisputeInitiatedEvent {
            trade_id,
            initiator,
            reason_hash,
        }
        .publish(&env);
    }

    /// Retrieve the `DisputeRecord` stored by `initiate_dispute()`, if any.
    pub fn get_dispute_record(env: Env, trade_id: u64) -> Option<DisputeRecord> {
        env.storage()
            .persistent()
            .get(&DataKey::DisputeData(trade_id))
    }

    /// Resolve a disputed trade with loss-sharing payouts.
    /// Only the registered mediator may call this.
    ///
    /// # Payout Math with Loss-Sharing
    ///
    /// Given:
    ///   - `total`              = total escrowed amount
    ///   - `seller_gets_bps`    = mediator's ruling: what fraction seller deserves (0–10_000)
    ///   - `buyer_loss_bps`     = buyer's share of any loss (from trade creation)
    ///   - `seller_loss_bps`    = seller's share of any loss (from trade creation)
    ///   - `fee_bps`            = platform fee in basis points (e.g. 100 = 1%)
    ///
    /// Step 1: Calculate the loss amount
    ///   loss_bps = 10_000 - seller_gets_bps
    ///   (e.g., if seller_gets_bps = 7_000, then loss_bps = 3_000 = 30% loss)
    ///
    /// Step 2: Distribute the loss according to agreed ratios
    ///   buyer_loss_amount  = total * loss_bps * buyer_loss_bps  / (10_000 * 10_000)
    ///   seller_loss_amount = total * loss_bps * seller_loss_bps / (10_000 * 10_000)
    ///
    /// Step 3: Calculate raw payouts
    ///   seller_raw   = total - seller_loss_amount
    ///   buyer_refund = total - seller_raw
    ///
    /// Step 4: Deduct platform fee from seller's portion only
    ///   fee        = seller_raw * fee_bps / 10_000
    ///   seller_net = seller_raw - fee
    ///
    /// Example (total=10_000, seller_gets_bps=7_000, buyer_loss_bps=6_000,
    ///          seller_loss_bps=4_000, fee_bps=100):
    ///   loss_bps         = 3_000 (30% loss)
    ///   buyer_loss       = 10_000 * 3_000 * 6_000 / 100_000_000 = 1_800
    ///   seller_loss      = 10_000 * 3_000 * 4_000 / 100_000_000 = 1_200
    ///   seller_raw       = 10_000 - 1_200 = 8_800
    ///   buyer_refund     = 10_000 - 8_800 = 1_200
    ///   fee              = 8_800 * 100 / 10_000 = 88
    ///   seller_net       = 8_800 - 88 = 8_712  → seller
    ///   buyer_refund     = 1_200                → buyer
    ///   treasury         = 88                   → treasury
    ///
    /// Verification: 8_712 + 1_200 + 88 = 10_000 ✓
    pub fn resolve_dispute(env: Env, trade_id: u64, mediator: Address, seller_gets_bps: u32) {
        // 1. Verify caller is the registered mediator
        let mediator = Self::require_mediator(&env, mediator);

        assert!(
            seller_gets_bps <= BPS_DIVISOR as u32,
            "seller_gets_bps must be <= 10_000"
        );

        // High-value disputes are not one mediator's to decide (#195).
        assert!(
            !Self::requires_quorum(env.clone(), trade_id),
            "Trade value requires a mediator quorum; use cast_dispute_vote"
        );

        Self::settle_dispute(&env, trade_id, seller_gets_bps, mediator);
    }

    // -----------------------------------------------------------------------
    // Mediator quorum for high-value disputes (#195)
    // -----------------------------------------------------------------------

    /// Return the active quorum policy, or the disabled default when the admin
    /// has not configured one.
    pub fn get_quorum_config(env: Env) -> QuorumConfig {
        env.storage()
            .instance()
            .get(&DataKey::QuorumConfig)
            .unwrap_or(QuorumConfig {
                enabled: false,
                value_threshold: DEFAULT_QUORUM_VALUE_THRESHOLD,
                required_weight: DEFAULT_QUORUM_REQUIRED_WEIGHT,
                vote_window_secs: DEFAULT_QUORUM_VOTE_WINDOW_SECS,
                fallback_min_weight: DEFAULT_QUORUM_FALLBACK_MIN_WEIGHT,
            })
    }

    /// Configure the quorum policy. Admin only.
    ///
    /// `fallback_min_weight` may not exceed `required_weight`: a fallback
    /// threshold above the quorum threshold could never be reached by a vote
    /// set that failed quorum, which would strand the escrow.
    pub fn set_quorum_config(
        env: Env,
        enabled: bool,
        value_threshold: i128,
        required_weight: u32,
        vote_window_secs: u64,
        fallback_min_weight: u32,
    ) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        admin.require_auth();

        assert!(value_threshold >= 0, "value_threshold must be non-negative");
        assert!(required_weight > 0, "required_weight must be positive");
        assert!(vote_window_secs > 0, "vote_window_secs must be positive");
        assert!(
            fallback_min_weight > 0,
            "fallback_min_weight must be positive"
        );
        assert!(
            fallback_min_weight <= required_weight,
            "fallback_min_weight must not exceed required_weight"
        );

        let config = QuorumConfig {
            enabled,
            value_threshold,
            required_weight,
            vote_window_secs,
            fallback_min_weight,
        };
        env.storage()
            .instance()
            .set(&DataKey::QuorumConfig, &config);

        QuorumConfigUpdatedEvent {
            enabled,
            value_threshold,
            required_weight,
            vote_window_secs,
            fallback_min_weight,
            schema_version: EVENT_SCHEMA_VERSION,
        }
        .publish(&env);
        Self::bump_instance_ttl(&env);
    }

    /// A mediator's vote weight. Unconfigured mediators carry
    /// [`DEFAULT_MEDIATOR_WEIGHT`].
    pub fn get_mediator_weight(env: Env, mediator: Address) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::MediatorWeight(mediator))
            .unwrap_or(DEFAULT_MEDIATOR_WEIGHT)
    }

    /// Set a mediator's vote weight. Admin only.
    ///
    /// Capped at [`MAX_MEDIATOR_WEIGHT`] so weighting cannot quietly collapse a
    /// quorum back into a single decisive signature.
    pub fn set_mediator_weight(env: Env, mediator: Address, weight: u32) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        admin.require_auth();

        assert!(weight > 0, "mediator weight must be positive");
        assert!(
            weight <= MAX_MEDIATOR_WEIGHT,
            "mediator weight exceeds the maximum"
        );

        env.storage()
            .persistent()
            .set(&DataKey::MediatorWeight(mediator.clone()), &weight);

        MediatorWeightUpdatedEvent {
            mediator,
            weight,
            schema_version: EVENT_SCHEMA_VERSION,
        }
        .publish(&env);
    }

    /// Whether `trade_id` must be resolved by quorum rather than by a single
    /// mediator.
    pub fn requires_quorum(env: Env, trade_id: u64) -> bool {
        let config = Self::get_quorum_config(env.clone());
        if !config.enabled {
            return false;
        }
        let trade: Trade = Self::load_trade(&env, &DataKey::Trade(trade_id));
        trade.amount >= config.value_threshold
    }

    /// Votes cast so far on a disputed trade, in the order they were cast.
    pub fn get_dispute_votes(env: Env, trade_id: u64) -> Vec<MediatorVote> {
        Self::quorum_state(&env, trade_id)
            .map(|state| state.votes)
            .unwrap_or(Vec::new(&env))
    }

    /// Cast a weighted vote on a high-value dispute (#195).
    ///
    /// Each approved mediator may vote once. When the weight backing a single
    /// outcome reaches `required_weight`, the dispute settles immediately on
    /// that outcome — no further call is needed.
    ///
    /// `rationale_hash` is mandatory: a vote that moves someone's money should
    /// be accountable to a stated reason, and the hash is what the audit trail
    /// and the dashboard display.
    ///
    /// Reverts if:
    /// - The caller is not an approved mediator.
    /// - The trade is not in `Disputed` status.
    /// - The trade does not require quorum (use `resolve_dispute`).
    /// - This mediator has already voted.
    /// - `rationale_hash` is empty or oversized.
    pub fn cast_dispute_vote(
        env: Env,
        trade_id: u64,
        mediator: Address,
        seller_gets_bps: u32,
        rationale_hash: String,
    ) {
        let mediator = Self::require_mediator(&env, mediator);

        assert!(
            seller_gets_bps <= BPS_DIVISOR as u32,
            "seller_gets_bps must be <= 10_000"
        );
        assert!(
            !rationale_hash.is_empty(),
            "rationale_hash must not be empty"
        );
        assert!(
            rationale_hash.len() <= MAX_HASH_LEN,
            "rationale_hash exceeds max length"
        );

        let trade: Trade = Self::load_trade(&env, &DataKey::Trade(trade_id));
        assert!(
            matches!(trade.status, TradeStatus::Disputed),
            "Trade must be in Disputed status"
        );

        let config = Self::get_quorum_config(env.clone());
        assert!(
            config.enabled && trade.amount >= config.value_threshold,
            "Trade does not require a mediator quorum; use resolve_dispute"
        );

        let now = env.ledger().timestamp();
        let mut state = Self::quorum_state(&env, trade_id).unwrap_or(QuorumState {
            trade_id,
            votes: Vec::new(&env),
            opened_at: now,
        });

        for existing in state.votes.iter() {
            assert!(
                existing.mediator != mediator,
                "Mediator has already voted on this dispute"
            );
        }

        let weight = Self::get_mediator_weight(env.clone(), mediator.clone());
        state.votes.push_back(MediatorVote {
            mediator: mediator.clone(),
            seller_gets_bps,
            weight,
            rationale_hash: rationale_hash.clone(),
            voted_at: now,
        });
        env.storage()
            .persistent()
            .set(&DataKey::DisputeVotes(trade_id), &state);

        let outcome_weight = Self::weight_for_outcome(&state.votes, seller_gets_bps);

        DisputeVoteCastEvent {
            trade_id,
            mediator,
            seller_gets_bps,
            weight,
            rationale_hash,
            outcome_weight,
            weight_to_quorum: config.required_weight.saturating_sub(outcome_weight),
            voted_at: now,
            schema_version: EVENT_SCHEMA_VERSION,
        }
        .publish(&env);

        // Settle as soon as one outcome carries enough weight.
        if outcome_weight >= config.required_weight {
            Self::finalize_quorum(
                &env,
                trade_id,
                &state,
                seller_gets_bps,
                outcome_weight,
                QuorumOutcome::Quorum,
            );
        }
    }

    /// Resolve a quorum dispute that never reached quorum, once its vote window
    /// has closed (#195).
    ///
    /// Without this, a quorum that fails to assemble would lock the escrow
    /// permanently — trading the single-mediator trust problem for a worse
    /// liveness one. The plurality outcome is applied, provided at least
    /// `fallback_min_weight` has voted.
    ///
    /// Callable by either trade party or any approved mediator: the parties are
    /// the ones whose funds are stuck, so they must not depend on a mediator
    /// choosing to act.
    ///
    /// Ties resolve to the lowest `seller_gets_bps` among the tied outcomes —
    /// the buyer-protective reading, since the buyer is the party whose funds
    /// are held and who did not receive the goods in question.
    pub fn resolve_dispute_by_fallback(env: Env, trade_id: u64, caller: Address) {
        caller.require_auth();

        let trade: Trade = Self::load_trade(&env, &DataKey::Trade(trade_id));
        assert!(
            matches!(trade.status, TradeStatus::Disputed),
            "Trade must be in Disputed status"
        );

        let is_party = caller == trade.buyer || caller == trade.seller;
        let is_mediator = Self::is_mediator(env.clone(), caller.clone());
        assert!(
            is_party || is_mediator,
            "Only a trade party or an approved mediator may trigger fallback resolution"
        );

        let config = Self::get_quorum_config(env.clone());
        assert!(
            config.enabled && trade.amount >= config.value_threshold,
            "Trade does not require a mediator quorum; use resolve_dispute"
        );

        let state = Self::quorum_state(&env, trade_id).expect("No votes cast on this dispute");
        assert!(!state.votes.is_empty(), "No votes cast on this dispute");

        let now = env.ledger().timestamp();
        assert!(
            now >= state.opened_at + config.vote_window_secs,
            "Vote window has not closed yet"
        );

        let total_weight = Self::total_vote_weight(&state.votes);
        assert!(
            total_weight >= config.fallback_min_weight,
            "Insufficient vote weight for fallback resolution"
        );

        let (winning_bps, winning_weight) = Self::plurality_outcome(&state.votes);
        Self::finalize_quorum(
            &env,
            trade_id,
            &state,
            winning_bps,
            winning_weight,
            QuorumOutcome::Fallback,
        );
    }

    // -----------------------------------------------------------------------
    // Evidence
    // -----------------------------------------------------------------------

    /// Submit evidence for an active dispute. Buyer, seller, or any mediator
    /// may call this any number of times while the trade is Disputed.
    /// All evidence submissions are stored as an append-only list on-chain,
    /// creating an immutable audit trail.
    ///
    /// `ipfs_hash` is typically an IPFS CID pointing to the evidence content.
    /// `description_hash` is an optional IPFS CID or hash describing the evidence.
    pub fn submit_evidence(
        env: Env,
        trade_id: u64,
        caller: Address,
        ipfs_hash: String,
        description_hash: String,
    ) {
        caller.require_auth();

        // Reject malformed payloads: the evidence pointer must be present, and
        // neither caller-supplied string may exceed the storage bound.
        // `description_hash` is optional and so is only length-bounded.
        assert!(!ipfs_hash.is_empty(), "ipfs_hash must not be empty");
        assert!(
            ipfs_hash.len() <= MAX_HASH_LEN,
            "ipfs_hash exceeds max length"
        );
        assert!(
            description_hash.len() <= MAX_HASH_LEN,
            "description_hash exceeds max length"
        );

        let key = DataKey::Trade(trade_id);
        let trade: Trade = Self::load_trade(&env, &key);

        assert!(
            matches!(trade.status, TradeStatus::Disputed),
            "Evidence can only be submitted for a Disputed trade"
        );

        // Allow buyer, seller, or any mediator to submit evidence
        let is_party = caller == trade.buyer || caller == trade.seller;
        let is_mediator = Self::is_mediator(env.clone(), caller.clone());

        assert!(
            is_party || is_mediator,
            "Only buyer, seller, or mediator can submit evidence"
        );

        // Get existing evidence list or create new one
        let evidence_key = DataKey::EvidenceList(trade_id);
        let mut evidence_list: Vec<EvidenceRecord> = env
            .storage()
            .persistent()
            .get(&evidence_key)
            .unwrap_or(Vec::new(&env));

        // Create new evidence record
        let now = env.ledger().timestamp();
        let record = EvidenceRecord {
            submitter: caller.clone(),
            ipfs_hash: ipfs_hash.clone(),
            description_hash: description_hash.clone(),
            submitted_at: now,
        };

        // Append to list
        evidence_list.push_back(record);

        // Store updated list
        env.storage()
            .persistent()
            .set(&evidence_key, &evidence_list);

        // For backward compatibility with legacy get_evidence API, we'll create
        // a simple Bytes representation. Since Soroban String doesn't easily convert
        // to Bytes, we'll use a placeholder approach or store the string length.
        // In practice, clients should use get_evidence_list() for the new API.
        let legacy_bytes = Bytes::new(&env);
        env.storage()
            .persistent()
            .set(&DataKey::Evidence(trade_id, caller.clone()), &legacy_bytes);

        EvidenceSubmittedEvent {
            trade_id,
            submitter: caller,
            evidence_hash: legacy_bytes,
        }
        .publish(&env);
    }

    /// Return all evidence records submitted for a trade, in chronological order.
    /// Returns an empty vector if no evidence has been submitted yet.
    pub fn get_evidence_list(env: Env, trade_id: u64) -> Vec<EvidenceRecord> {
        env.storage()
            .persistent()
            .get(&DataKey::EvidenceList(trade_id))
            .unwrap_or(Vec::new(&env))
    }

    /// Return the evidence hash most recently submitted by `submitter` (legacy).
    /// Returns `None` if no evidence has been submitted yet.
    pub fn get_evidence(env: Env, trade_id: u64, submitter: Address) -> Option<Bytes> {
        env.storage()
            .persistent()
            .get(&DataKey::Evidence(trade_id, submitter))
    }
}

// ---------------------------------------------------------------------------
// Internal dispute helpers (not exported as contract functions)
// ---------------------------------------------------------------------------

impl EscrowContract {
    /// Verifies that the caller is an approved mediator (registry OR legacy slot).
    pub(crate) fn require_mediator(env: &Env, mediator: Address) -> Address {
        mediator.require_auth();

        let in_registry = env
            .storage()
            .persistent()
            .get::<_, bool>(&DataKey::MediatorRegistry(mediator.clone()))
            .unwrap_or(false);
        if in_registry {
            return mediator;
        }

        if let Some(legacy_mediator) = env
            .storage()
            .instance()
            .get::<_, Address>(&DataKey::Mediator)
        {
            if legacy_mediator == mediator {
                return mediator;
            }
        }

        panic!("Unauthorized mediator");
    }

    /// Apply a decided dispute outcome: compute the split, move the funds, and
    /// close the trade.
    ///
    /// Shared by the single-mediator path and both quorum paths so all three
    /// settle identically — the only difference between them is who is allowed
    /// to decide `seller_gets_bps`, never how the money is split (#195).
    pub(crate) fn settle_dispute(env: &Env, trade_id: u64, seller_gets_bps: u32, mediator: Address) {
        let env = env.clone();
        // 2. Load and validate trade
        let key = DataKey::Trade(trade_id);
        let mut trade: Trade = Self::load_trade(&env, &key);
        assert!(
            matches!(trade.status, TradeStatus::Disputed),
            "Trade must be in Disputed status"
        );

        // 3. Load fee config
        let fee_bps: u32 = env.storage().instance().get(&DataKey::FeeBps).unwrap_or(0);

        // 4. Payout math with loss-sharing
        let total = trade.amount;

        // Calculate the loss amount in basis points
        let loss_bps = BPS_DIVISOR - (seller_gets_bps as i128);

        // Distribute loss according to agreed ratios
        // seller_loss = total * loss_bps * seller_loss_bps / (10_000 * 10_000)
        let seller_loss_amount = checked_loss_amount(total, loss_bps, trade.seller_loss_bps);

        // Calculate raw payouts
        let seller_raw = total - seller_loss_amount;
        let buyer_refund = total - seller_raw;

        // Deduct platform fee from seller's portion only
        let fee = checked_fee_amount(seller_raw, fee_bps);
        let seller_net = seller_raw - fee;

        // Invariants: all payouts non-negative and sum to total cNGN escrowed
        assert!(seller_net >= 0, "seller_net must be non-negative");
        assert!(buyer_refund >= 0, "buyer_refund must be non-negative");
        assert!(fee >= 0, "fee must be non-negative");
        assert!(
            seller_net + buyer_refund + fee == total,
            "resolve_dispute: cNGN conservation invariant violated"
        );

        // 5. Execute three atomic transfers
        let token_client = token::Client::new(&env, &trade.token);

        if seller_net > 0 {
            token_client.transfer(&env.current_contract_address(), &trade.seller, &seller_net);
        }
        if fee > 0 {
            let accrued_fees: i128 = env
                .storage()
                .instance()
                .get(&DataKey::AccruedFees)
                .unwrap_or(0);
            env.storage()
                .instance()
                .set(&DataKey::AccruedFees, &(accrued_fees + fee));
        }
        if buyer_refund > 0 {
            token_client.transfer(&env.current_contract_address(), &trade.buyer, &buyer_refund);
        }

        // 6. Update trade state
        let now = env.ledger().timestamp();
        trade.status = TradeStatus::Completed;
        trade.updated_at = now;
        Self::save_trade(&env, &key, &trade);
        Self::update_release_sequence(&env, &trade, |sequence, at| {
            sequence.resolved_at = Some(at);
        });

        // Increment aggregate resolved counter
        let total_resolved: u64 = env
            .storage()
            .instance()
            .get(&DataKey::TotalResolved)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalResolved, &(total_resolved + 1));

        // 7. Emit event
        DisputeResolvedEvent {
            trade_id,
            seller_payout: seller_net,
            buyer_refund,
            mediator,
        }
        .publish(&env);
    }

    /// Settle a quorum dispute and publish the quorum-specific event.
    ///
    /// The votes are deliberately left in storage: they are the audit trail for
    /// a decision that moved someone's money, and `get_dispute_votes()` must
    /// keep answering after resolution.
    pub(crate) fn finalize_quorum(
        env: &Env,
        trade_id: u64,
        state: &QuorumState,
        seller_gets_bps: u32,
        winning_weight: u32,
        outcome: QuorumOutcome,
    ) {
        // The winning outcome's first voter stands as the mediator of record on
        // DisputeResolvedEvent, so existing listeners still see a mediator.
        let mediator_of_record = state
            .votes
            .iter()
            .find(|vote| vote.seller_gets_bps == seller_gets_bps)
            .map(|vote| vote.mediator)
            .expect("winning outcome must have at least one vote");

        Self::settle_dispute(env, trade_id, seller_gets_bps, mediator_of_record);

        DisputeQuorumResolvedEvent {
            trade_id,
            seller_gets_bps,
            outcome,
            winning_weight,
            total_weight: Self::total_vote_weight(&state.votes),
            vote_count: state.votes.len(),
            schema_version: EVENT_SCHEMA_VERSION,
        }
        .publish(env);
    }

    pub(crate) fn quorum_state(env: &Env, trade_id: u64) -> Option<QuorumState> {
        env.storage()
            .persistent()
            .get(&DataKey::DisputeVotes(trade_id))
    }

    /// Total weight backing one specific outcome.
    pub(crate) fn weight_for_outcome(votes: &Vec<MediatorVote>, seller_gets_bps: u32) -> u32 {
        let mut total = 0u32;
        for vote in votes.iter() {
            if vote.seller_gets_bps == seller_gets_bps {
                total = total.saturating_add(vote.weight);
            }
        }
        total
    }

    pub(crate) fn total_vote_weight(votes: &Vec<MediatorVote>) -> u32 {
        let mut total = 0u32;
        for vote in votes.iter() {
            total = total.saturating_add(vote.weight);
        }
        total
    }

    /// The outcome carrying the most weight. Ties break to the lowest
    /// `seller_gets_bps`, which favours the buyer.
    ///
    /// Quadratic in the vote count, which is bounded by the size of the
    /// mediator set — a handful of entries, not a growing list.
    pub(crate) fn plurality_outcome(votes: &Vec<MediatorVote>) -> (u32, u32) {
        let mut best_bps = 0u32;
        let mut best_weight = 0u32;
        let mut seen_any = false;

        for candidate in votes.iter() {
            let bps = candidate.seller_gets_bps;
            let weight = Self::weight_for_outcome(votes, bps);
            let wins = !seen_any
                || weight > best_weight
                || (weight == best_weight && bps < best_bps);
            if wins {
                best_bps = bps;
                best_weight = weight;
                seen_any = true;
            }
        }

        (best_bps, best_weight)
    }
}
