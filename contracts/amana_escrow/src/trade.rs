//! Trade lifecycle: creation, funding, cancellation, expiry, deadline
//! extensions, delivery, release, delivery artefacts and read-only views.

use soroban_sdk::{Address, Env, String, Vec, contractimpl, panic_with_error, token};

use crate::*;

#[contractimpl]
impl EscrowContract {
    // -----------------------------------------------------------------------
    // Trade lifecycle
    // -----------------------------------------------------------------------

    pub fn create_trade(
        env: Env,
        buyer: Address,
        seller: Address,
        amount: i128,
        buyer_loss_bps: u32,
        seller_loss_bps: u32,
        expires_at: Option<u64>,
    ) -> u64 {
        Self::assert_not_paused(&env);
        buyer.require_auth();
        assert!(amount > 0, "amount must be greater than zero");
        assert!(amount <= MAX_TRADE_VALUE, "TradeValueTooLarge");
        assert!(
            buyer != seller,
            "buyer and seller must be different addresses"
        );
        // Bound each share before summing so a malformed out-of-range value is
        // rejected with a clear message rather than triggering an opaque u32
        // overflow panic on the addition below.
        assert!(
            buyer_loss_bps <= 10_000,
            "buyer_loss_bps must not exceed 10000"
        );
        assert!(
            seller_loss_bps <= 10_000,
            "seller_loss_bps must not exceed 10000"
        );
        assert!(
            buyer_loss_bps + seller_loss_bps == 10_000,
            "loss ratios must sum to 10000 (100%)"
        );
        let now = env.ledger().timestamp();
        // Validate deadline is in the future when provided
        if let Some(deadline) = expires_at {
            assert!(deadline > now, "expires_at must be in the future");
        }
        let next_id: u64 = env
            .storage()
            .instance()
            .get(&NEXT_TRADE_ID)
            .unwrap_or(1_u64);
        let ledger_seq = env.ledger().sequence() as u64;
        let trade_id = (ledger_seq << 32) | next_id;
        env.storage().instance().set(&NEXT_TRADE_ID, &(next_id + 1));
        let total_trades: u64 = env
            .storage()
            .instance()
            .get(&DataKey::TotalTrades)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalTrades, &(total_trades + 1));
        let cngn_address: Address = env
            .storage()
            .instance()
            .get(&DataKey::CngnContract)
            .expect("Not initialized");
        let trade = Trade {
            trade_id,
            buyer: buyer.clone(),
            seller: seller.clone(),
            token: cngn_address,
            amount,
            status: TradeStatus::Created,
            created_at: now,
            updated_at: now,
            funded_at: None,
            delivered_at: None,
            buyer_loss_bps,
            seller_loss_bps,
            expires_at,
        };
        Self::save_trade(&env, &DataKey::Trade(trade_id), &trade);
        env.storage().persistent().set(
            &DataKey::ReleaseSequence(trade_id),
            &Self::default_release_sequence(&trade),
        );
        Self::record_trade_event(
            &env,
            trade_id,
            "created",
            trade.buyer.clone(),
            "trade created",
        );
        TradeCreatedEvent {
            trade_id,
            buyer,
            seller,
            amount,
        }
        .publish(&env);
        Self::bump_instance_ttl(&env);
        trade_id
    }

    pub fn deposit(env: Env, trade_id: u64) {
        Self::assert_not_paused(&env);
        let key = DataKey::Trade(trade_id);
        let mut trade: Trade = Self::load_trade(&env, &key);
        assert!(
            matches!(trade.status, TradeStatus::Created),
            "Trade must be in Created status"
        );
        trade.buyer.require_auth();
        let token_client = token::Client::new(&env, &trade.token);
        token_client.transfer(&trade.buyer, env.current_contract_address(), &trade.amount);
        let now = env.ledger().timestamp();
        trade.status = TradeStatus::Funded;
        trade.funded_at = Some(now);
        trade.updated_at = now;
        Self::save_trade(&env, &key, &trade);
        Self::update_release_sequence(&env, &trade, |sequence, at| {
            sequence.funded_at = Some(at);
        });
        Self::record_trade_event(
            &env,
            trade_id,
            "funded",
            trade.buyer.clone(),
            "escrow funded",
        );
        TradeFundedEvent {
            trade_id,
            amount: trade.amount,
        }
        .publish(&env);
        Self::bump_instance_ttl(&env);
    }

    pub fn deposit_with_path(
        env: Env,
        trade_id: u64,
        buyer: Address,
        source_amount: i128,
        dest_min: i128,
        path: Vec<Address>,
    ) {
        assert!(source_amount > 0, "source_amount must be greater than zero");
        assert!(dest_min > 0, "dest_min must be greater than zero");

        let key = DataKey::Trade(trade_id);
        let mut trade: Trade = Self::load_trade(&env, &key);
        assert!(
            matches!(trade.status, TradeStatus::Created),
            "Trade must be in Created status"
        );
        assert!(
            buyer == trade.buyer,
            "Only the buyer can perform a path payment deposit"
        );
        buyer.require_auth();

        let source_token: Address = env
            .storage()
            .instance()
            .get(&DataKey::SourceToken)
            .expect("SourceToken not configured");

        let source_client = token::Client::new(&env, &source_token);
        let contract_addr = env.current_contract_address();

        source_client.transfer(&trade.buyer, &contract_addr, &source_amount);
        let cngn_client = token::Client::new(&env, &trade.token);
        let cngn_before = cngn_client.balance(&contract_addr);

        let intent_key = DataKey::PathPaymentIntent(trade_id);
        assert!(
            !env.storage().persistent().has(&intent_key),
            "Path payment already pending"
        );

        let intent = PathPaymentIntent {
            buyer: buyer.clone(),
            source_amount,
            dest_min,
            path: path.clone(),
            cngn_balance_before: cngn_before,
        };

        env.storage().persistent().set(&intent_key, &intent);

        trade.updated_at = env.ledger().timestamp();
        Self::save_trade(&env, &key, &trade);

        PathPaymentInitiatedEvent {
            trade_id,
            buyer,
            source_token,
            source_amount,
            dest_min,
            path,
        }
        .publish(&env);

        Self::bump_instance_ttl(&env);
    }

    /// Finalize a previously initiated path payment once cNGN has been received.
    pub fn finalize_path_payment(env: Env, trade_id: u64, caller: Address) {
        caller.require_auth();

        let intent_key = DataKey::PathPaymentIntent(trade_id);
        let intent: PathPaymentIntent = env
            .storage()
            .persistent()
            .get(&intent_key)
            .expect("No pending path payment");

        let key = DataKey::Trade(trade_id);
        let mut trade: Trade = Self::load_trade(&env, &key);
        assert!(
            matches!(trade.status, TradeStatus::Created),
            "Trade must be in Created status"
        );

        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        assert!(
            caller == intent.buyer || caller == admin,
            "Unauthorized path payment finalization"
        );

        let contract_addr = env.current_contract_address();
        let cngn_client = token::Client::new(&env, &trade.token);
        let cngn_after = cngn_client.balance(&contract_addr);
        let dest_amount = cngn_after
            .checked_sub(intent.cngn_balance_before)
            .expect("cNGN balance underflow");

        assert!(
            dest_amount >= intent.dest_min,
            "Path payment: dest_amount below dest_min"
        );

        let now = env.ledger().timestamp();
        trade.amount = dest_amount;
        trade.status = TradeStatus::Funded;
        trade.funded_at = Some(now);
        trade.updated_at = now;
        Self::save_trade(&env, &key, &trade);

        env.storage().persistent().remove(&intent_key);

        PathPaymentExecutedEvent {
            trade_id,
            buyer: intent.buyer,
            source_token: env
                .storage()
                .instance()
                .get(&DataKey::SourceToken)
                .expect("SourceToken not configured"),
            source_amount: intent.source_amount,
            dest_token: trade.token.clone(),
            dest_amount,
        }
        .publish(&env);

        Self::bump_instance_ttl(&env);
    }

    /// Cancel a trade or perform an admin clawback.
    ///
    /// If the trade is in `Created` status, the buyer, seller, or admin can cancel without moving funds.
    /// If the trade is in `Funded` status:
    /// - If called by the `admin`, it acts as an immediate unilateral clawback/refund of escrowed funds to the buyer.
    /// - If called by buyer or seller, both parties must submit cancellation requests before funds are returned to the buyer.
    ///
    /// # Cost Drivers for Admin Clawback (Funded status)
    /// - Storage read for `Trade` record and `Admin` address instance storage.
    /// - Auth verification for `caller` (`admin.require_auth()`).
    /// - Token transfer (`token::Client::transfer`) from contract address back to buyer address.
    /// - Persistent storage write to update `TradeStatus::Cancelled` and `updated_at`.
    /// - Persistent storage write for `ReleaseSequence` tracking (`cancelled_at`).
    /// - Contract event publication (`TradeCancelledEvent`).
    /// - Instance storage TTL extension (`bump_instance_ttl`).
    pub fn cancel_trade(env: Env, trade_id: u64, caller: Address) {
        Self::assert_not_paused(&env);
        let key = DataKey::Trade(trade_id);
        let mut trade: Trade = Self::load_trade(&env, &key);
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");

        caller.require_auth();

        if matches!(trade.status, TradeStatus::Created) {
            assert!(
                caller == trade.buyer || caller == trade.seller || caller == admin,
                "Unauthorized caller"
            );
            Self::execute_cancellation(&env, &mut trade, 0, caller);
        } else if matches!(trade.status, TradeStatus::Funded) {
            let amount = trade.amount;
            if caller == admin {
                Self::execute_cancellation(&env, &mut trade, amount, admin);
            } else {
                assert!(
                    caller == trade.buyer || caller == trade.seller,
                    "Unauthorized caller"
                );

                let req_key = DataKey::CancelRequest(trade_id);
                let mut requests: (bool, bool) = env
                    .storage()
                    .persistent()
                    .get(&req_key)
                    .unwrap_or((false, false));

                if caller == trade.buyer {
                    requests.0 = true;
                } else if caller == trade.seller {
                    requests.1 = true;
                }

                if requests.0 && requests.1 {
                    Self::execute_cancellation(&env, &mut trade, amount, caller);
                    env.storage().persistent().remove(&req_key);
                } else {
                    env.storage().persistent().set(&req_key, &requests);
                    trade.updated_at = env.ledger().timestamp();
                    Self::save_trade(&env, &key, &trade);
                }
            }
        } else {
            panic!("Cannot cancel trade in current status");
        }
    }

    /// Allow the buyer to cancel a trade before funds are deposited.
    ///
    /// This is intentionally narrower than `cancel_trade`: only the buyer may
    /// call it and only while the trade is still `Created`.
    pub fn cancel_by_buyer(env: Env, trade_id: u64) {
        let key = DataKey::Trade(trade_id);
        let mut trade: Trade = Self::load_trade(&env, &key);

        trade.buyer.require_auth();
        assert!(
            matches!(trade.status, TradeStatus::Created),
            "Trade must be in Created status"
        );

        trade.status = TradeStatus::Cancelled;
        trade.updated_at = env.ledger().timestamp();
        Self::save_trade(&env, &key, &trade);
        Self::update_release_sequence(&env, &trade, |sequence, at| {
            sequence.cancelled_at = Some(at);
        });

        TradeCancelledByBuyerEvent {
            trade_id,
            buyer: trade.buyer,
        }
        .publish(&env);
        Self::bump_instance_ttl(&env);
    }

    /// Unilaterally refund a funded or delivered trade.
    ///
    /// Only the seller may call this. It transitions the trade to `Cancelled`
    /// and returns the full escrowed amount to the buyer. This is useful when
    /// the seller cannot fulfill the order or chooses to return funds after
    /// a delivery issue without requiring a formal dispute.
    pub fn refund(env: Env, trade_id: u64) {
        let key = DataKey::Trade(trade_id);
        let mut trade: Trade = Self::load_trade(&env, &key);

        trade.seller.require_auth();

        assert!(
            matches!(trade.status, TradeStatus::Funded | TradeStatus::Delivered),
            "Trade must be Funded or Delivered to be refunded by seller"
        );

        let amount = trade.amount;
        let seller = trade.seller.clone();
        Self::execute_cancellation(&env, &mut trade, amount, seller);
    }

    /// Claim an auto-refund on a trade whose expiry deadline has passed.
    ///
    /// Either the buyer or the seller may call this once `expires_at` has been
    /// reached and the trade is still in `Funded` status (i.e. the buyer has
    /// not yet confirmed delivery and no dispute is active). The full escrowed
    /// amount is returned to the buyer.
    ///
    /// Reverts if:
    /// - The trade has no `expires_at` deadline set.
    /// - The current ledger timestamp is before `expires_at`.
    /// - The trade is not in `Funded` status (already delivered, disputed, etc.).
    /// - The caller is neither the buyer nor the seller.
    pub fn claim_expiry_refund(env: Env, trade_id: u64, caller: Address) {
        caller.require_auth();

        let key = DataKey::Trade(trade_id);
        let mut trade: Trade = env
            .storage()
            .persistent()
            .get(&key)
            .expect("Trade not found");

        assert!(
            caller == trade.buyer || caller == trade.seller,
            "Only the buyer or seller can claim an expiry refund"
        );
        assert!(
            matches!(trade.status, TradeStatus::Funded),
            "Trade must be in Funded status to claim expiry refund"
        );

        // A buyer who has acknowledged a partial arrival cannot also reclaim
        // the full escrow by letting the deadline lapse (#349).
        assert!(
            !env.storage()
                .persistent()
                .has(&DataKey::PartialDelivery(trade_id)),
            "Partial delivery pending; accept or escalate it instead"
        );

        let deadline = trade.expires_at.expect("Trade has no expiry deadline");

        let now = env.ledger().timestamp();
        assert!(now >= deadline, "Trade has not yet expired");

        let refund_amount = trade.amount;

        // Return funds to buyer
        let token_client = token::Client::new(&env, &trade.token);
        token_client.transfer(
            &env.current_contract_address(),
            &trade.buyer,
            &refund_amount,
        );

        trade.status = TradeStatus::Cancelled;
        trade.updated_at = now;
        env.storage().persistent().set(&key, &trade);

        Self::update_release_sequence(&env, &trade, |sequence, at| {
            sequence.expired_at = Some(at);
            sequence.cancelled_at = Some(at);
        });

        TradeExpiredEvent {
            trade_id,
            refund_amount,
            caller,
        }
        .publish(&env);
    }

    /// Allow both the buyer and seller to mutually agree to extend the delivery
    /// deadline on a funded trade. The caller is the buyer (who triggers the
    /// extension), and the contract also requires the seller's authorization.
    ///
    /// Both caps in [`ExtensionPolicy`] are enforced here, at the contract
    /// layer, because this is the only authoritative one: the backend mirror in
    /// `tradeDeadline.service.ts` can be bypassed by calling the contract
    /// directly (#194).
    ///
    /// Reverts if:
    /// - The trade is not in `Funded` status.
    /// - The current ledger timestamp is at or past the existing deadline.
    /// - The new deadline is not strictly in the future.
    /// - The trade has already used its full extension count.
    /// - The new deadline would push the trade past the absolute lifetime cap.
    /// - The new deadline is not later than the current one (an "extension"
    ///   that shortens the deadline would consume budget while giving the
    ///   buyer nothing).
    pub fn extend_deadline(env: Env, trade_id: u64, new_deadline: u64) {
        let key = DataKey::Trade(trade_id);
        let mut trade: Trade = Self::load_trade(&env, &key);

        // Require authorization from both parties
        trade.buyer.require_auth();
        trade.seller.require_auth();

        assert!(
            matches!(trade.status, TradeStatus::Funded),
            "Trade must be Funded to extend deadline"
        );

        let old_deadline = trade.expires_at.expect("Trade has no deadline to extend");

        let now = env.ledger().timestamp();
        assert!(
            now < old_deadline,
            "Cannot extend a deadline that has already passed"
        );
        assert!(new_deadline > now, "New deadline must be in the future");
        assert!(
            new_deadline > old_deadline,
            "New deadline must be later than the current deadline"
        );

        let policy = Self::get_extension_policy(env.clone());
        let used = Self::extension_count(&env, trade_id);

        assert!(
            used < policy.max_extensions,
            "Trade has exhausted its deadline extension allowance"
        );

        // The original deadline is captured on the first extension; from then
        // on every cap check measures against that fixed origin.
        let original_deadline = Self::original_deadline(&env, trade_id).unwrap_or(old_deadline);
        let extended_by = new_deadline.saturating_sub(original_deadline);
        assert!(
            extended_by <= policy.max_total_extension_secs,
            "New deadline exceeds the maximum total extension for this trade"
        );

        if used == 0 {
            env.storage()
                .persistent()
                .set(&DataKey::OriginalDeadline(trade_id), &original_deadline);
        }

        let extensions_used = used + 1;
        env.storage()
            .persistent()
            .set(&DataKey::ExtensionCount(trade_id), &extensions_used);

        trade.expires_at = Some(new_deadline);
        trade.updated_at = now;
        Self::save_trade(&env, &key, &trade);
        Self::record_trade_event(
            &env,
            trade_id,
            "deadline_extended",
            trade.buyer.clone(),
            "delivery deadline extended",
        );

        // Budget first, then the extension itself: `DeadlineExtendedEvent`
        // stays the last event this call emits, which existing listeners and
        // `extend_deadline_tests.rs` rely on to identify the extension.
        DeadlineExtensionBudgetEvent {
            trade_id,
            extensions_used,
            extensions_remaining: policy.max_extensions - extensions_used,
            original_deadline,
            extended_by_secs: extended_by,
            extension_secs_remaining: policy
                .max_total_extension_secs
                .saturating_sub(extended_by),
            schema_version: EVENT_SCHEMA_VERSION,
        }
        .publish(&env);

        DeadlineExtendedEvent {
            trade_id,
            old_deadline,
            new_deadline,
        }
        .publish(&env);

        Self::bump_instance_ttl(&env);
    }

    /// Return the active extension policy, falling back to the defaults when
    /// the admin has not configured one (#194).
    pub fn get_extension_policy(env: Env) -> ExtensionPolicy {
        env.storage()
            .instance()
            .get(&DataKey::ExtensionPolicy)
            .unwrap_or(ExtensionPolicy {
                max_extensions: DEFAULT_MAX_DEADLINE_EXTENSIONS,
                max_total_extension_secs: DEFAULT_MAX_TOTAL_EXTENSION_SECS,
            })
    }

    /// Configure the extension caps. Admin only (#194).
    ///
    /// Both values are bounded by `EXTENSION_POLICY_CEILING_*` so that the cap
    /// remains a meaningful protection for buyers even against a compromised
    /// admin key. `max_extensions` of zero is permitted and disables extensions
    /// entirely.
    pub fn set_extension_policy(env: Env, max_extensions: u32, max_total_extension_secs: u64) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        admin.require_auth();

        assert!(
            max_extensions <= EXTENSION_POLICY_CEILING_COUNT,
            "max_extensions exceeds the policy ceiling"
        );
        assert!(
            max_total_extension_secs <= EXTENSION_POLICY_CEILING_SECS,
            "max_total_extension_secs exceeds the policy ceiling"
        );

        let policy = ExtensionPolicy {
            max_extensions,
            max_total_extension_secs,
        };
        env.storage()
            .instance()
            .set(&DataKey::ExtensionPolicy, &policy);

        ExtensionPolicyUpdatedEvent {
            max_extensions,
            max_total_extension_secs,
            schema_version: EVENT_SCHEMA_VERSION,
        }
        .publish(&env);
        Self::bump_instance_ttl(&env);
    }

    /// Report a trade's remaining extension budget (#194).
    ///
    /// Read-only, so a client can warn before the parties sign an extension
    /// that turns out to be their last.
    pub fn get_extension_status(env: Env, trade_id: u64) -> ExtensionStatus {
        let trade: Trade = Self::load_trade(&env, &DataKey::Trade(trade_id));
        let policy = Self::get_extension_policy(env.clone());
        let used = Self::extension_count(&env, trade_id);

        // Before the first extension the current deadline *is* the original.
        let original_deadline = Self::original_deadline(&env, trade_id).or(trade.expires_at);
        let extended_by = match (original_deadline, trade.expires_at) {
            (Some(original), Some(current)) => current.saturating_sub(original),
            _ => 0,
        };
        let secs_remaining = policy.max_total_extension_secs.saturating_sub(extended_by);
        let count_remaining = policy.max_extensions.saturating_sub(used);

        ExtensionStatus {
            trade_id,
            extensions_used: used,
            extensions_remaining: count_remaining,
            original_deadline,
            extended_by_secs: extended_by,
            extension_secs_remaining: secs_remaining,
            is_final_extension: count_remaining == 1,
            is_exhausted: count_remaining == 0 || secs_remaining == 0,
        }
    }

    pub fn confirm_delivery(env: Env, trade_id: u64) {
        let key = DataKey::Trade(trade_id);
        let mut trade: Trade = Self::load_trade(&env, &key);
        trade.buyer.require_auth();
        assert!(
            matches!(trade.status, TradeStatus::Funded),
            "Trade must be funded"
        );
        let now = env.ledger().timestamp();
        trade.status = TradeStatus::Delivered;
        trade.delivered_at = Some(now);
        trade.updated_at = now;
        Self::save_trade(&env, &key, &trade);
        Self::update_release_sequence(&env, &trade, |sequence, at| {
            sequence.delivered_at = Some(at);
        });
        Self::record_trade_event(
            &env,
            trade_id,
            "delivered",
            trade.buyer.clone(),
            "delivery confirmed",
        );
        DeliveryConfirmedEvent {
            trade_id,
            delivered_at: now,
        }
        .publish(&env);
    }

    pub fn release_funds(env: Env, trade_id: u64, caller: Address) {
        Self::assert_not_paused(&env);
        let key = DataKey::Trade(trade_id);
        let mut trade: Trade = Self::load_trade(&env, &key);
        assert!(
            matches!(trade.status, TradeStatus::Delivered),
            "Trade must be delivered"
        );

        caller.require_auth();

        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        assert!(
            caller == trade.buyer || caller == admin,
            "Unauthorized caller"
        );

        let fee_bps: u32 = env.storage().instance().get(&DataKey::FeeBps).unwrap_or(0);
        let fee_amount = checked_fee_amount(trade.amount, fee_bps);
        let seller_amount = trade.amount - fee_amount;
        assert!(
            seller_amount + fee_amount == trade.amount,
            "release_funds: cNGN conservation invariant violated"
        );
        assert!(seller_amount >= 0, "seller_amount must be non-negative");
        assert!(fee_amount >= 0, "fee_amount must be non-negative");
        let token_client = token::Client::new(&env, &trade.token);
        token_client.transfer(
            &env.current_contract_address(),
            &trade.seller,
            &seller_amount,
        );
        if fee_amount > 0 {
            let accrued_fees: i128 = env
                .storage()
                .instance()
                .get(&DataKey::AccruedFees)
                .unwrap_or(0);
            env.storage()
                .instance()
                .set(&DataKey::AccruedFees, &(accrued_fees + fee_amount));
        }
        let now = env.ledger().timestamp();
        trade.status = TradeStatus::Completed;
        trade.updated_at = now;
        Self::save_trade(&env, &key, &trade);
        Self::update_release_sequence(&env, &trade, |sequence, at| {
            sequence.released_at = Some(at);
        });
        Self::record_trade_event(
            &env,
            trade_id,
            "released",
            caller.clone(),
            "funds released to seller",
        );
        FundsReleasedEvent {
            trade_id,
            seller_amount,
            fee_amount,
        }
        .publish(&env);
    }

    // -----------------------------------------------------------------------
    // Video proof
    // -----------------------------------------------------------------------

    /// Anchor a delivery video's IPFS CID on-chain for a specific trade.
    ///
    /// Either the buyer or the seller may submit video proof.
    /// The trade must be in `Funded` or `Disputed` status.
    /// Only one video proof is allowed per trade — attempting to overwrite panics.
    ///
    /// `ipfs_cid` must be a non-empty IPFS content identifier.
    pub fn submit_video_proof(env: Env, trade_id: u64, submitter: Address, ipfs_cid: String) {
        submitter.require_auth();

        assert!(!ipfs_cid.is_empty(), "ipfs_cid must not be empty");
        assert!(
            ipfs_cid.len() <= MAX_HASH_LEN,
            "ipfs_cid exceeds max length"
        );

        let key = DataKey::Trade(trade_id);
        let trade: Trade = Self::load_trade(&env, &key);

        assert!(
            matches!(trade.status, TradeStatus::Funded | TradeStatus::Disputed),
            "Video proof can only be submitted for a Funded or Disputed trade"
        );

        assert!(
            submitter == trade.buyer || submitter == trade.seller,
            "Only the buyer or seller can submit video proof"
        );

        let proof_key = DataKey::VideoProof(trade_id);
        assert!(
            !env.storage().persistent().has(&proof_key),
            "Video proof already submitted for this trade"
        );

        let now = env.ledger().timestamp();
        let record = VideoProofRecord {
            submitter: submitter.clone(),
            ipfs_cid: ipfs_cid.clone(),
            submitted_at: now,
        };

        env.storage().persistent().set(&proof_key, &record);

        VideoProofSubmittedEvent {
            trade_id,
            submitter,
            ipfs_cid,
            timestamp: now,
        }
        .publish(&env);
    }

    /// Submit hashed delivery manifest fields for a funded trade.
    /// Only seller may submit, and only once per trade.
    pub fn submit_manifest(
        env: Env,
        trade_id: u64,
        seller: Address,
        driver_name_hash: String,
        driver_id_hash: String,
    ) {
        seller.require_auth();
        assert!(
            !driver_name_hash.is_empty(),
            "driver_name_hash must not be empty"
        );
        assert!(
            !driver_id_hash.is_empty(),
            "driver_id_hash must not be empty"
        );
        assert!(
            driver_name_hash.len() <= MAX_HASH_LEN,
            "driver_name_hash exceeds max length"
        );
        assert!(
            driver_id_hash.len() <= MAX_HASH_LEN,
            "driver_id_hash exceeds max length"
        );

        let key = DataKey::Trade(trade_id);
        let trade: Trade = Self::load_trade(&env, &key);

        assert!(
            matches!(trade.status, TradeStatus::Funded),
            "Trade must be funded"
        );
        assert!(seller == trade.seller, "Only seller can submit manifest");

        let manifest_key = DataKey::Manifest(trade_id);
        assert!(
            !env.storage().persistent().has(&manifest_key),
            "Manifest already submitted"
        );

        let record = DeliveryManifestRecord {
            seller: seller.clone(),
            driver_name_hash: driver_name_hash.clone(),
            driver_id_hash: driver_id_hash.clone(),
            submitted_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&manifest_key, &record);
        Self::update_release_sequence(&env, &trade, |sequence, at| {
            sequence.manifest_submitted_at = Some(at);
        });

        ManifestSubmittedEvent {
            trade_id,
            seller,
            driver_name_hash,
            driver_id_hash,
            timestamp: env.ledger().timestamp(),
        }
        .publish(&env);
    }

    /// Fetch manifest record for a trade, if present.
    pub fn get_manifest(env: Env, trade_id: u64) -> Option<DeliveryManifestRecord> {
        env.storage().persistent().get(&DataKey::Manifest(trade_id))
    }

    /// Fetch on-chain release sequence timestamps for a trade.
    pub fn get_release_sequence(env: Env, trade_id: u64) -> ReleaseSequence {
        if let Some(sequence) = env
            .storage()
            .persistent()
            .get::<_, ReleaseSequence>(&DataKey::ReleaseSequence(trade_id))
        {
            return sequence;
        }

        let trade: Trade = Self::load_trade(&env, &DataKey::Trade(trade_id));
        Self::default_release_sequence(&trade)
    }

    /// Retrieve the video proof record for a trade, if any.
    pub fn get_video_proof(env: Env, trade_id: u64) -> Option<VideoProofRecord> {
        env.storage()
            .persistent()
            .get(&DataKey::VideoProof(trade_id))
    }

    // -----------------------------------------------------------------------
    // Views
    // -----------------------------------------------------------------------

    pub fn get_trade(env: Env, trade_id: u64) -> Trade {
        let key = DataKey::Trade(trade_id);
        Self::load_trade(&env, &key)
    }

    /// Batch variant of [`get_trade`](Self::get_trade) (#351).
    ///
    /// Returns one entry per requested id, in input order: `Some(trade)` when
    /// the id exists and `None` when it does not, so a dashboard can render a
    /// whole page from a single simulation instead of N round-trips. Unknown
    /// ids never panic. Duplicate ids are returned once per occurrence.
    ///
    /// Panics with [`EscrowError::BatchTooLarge`] when more than
    /// [`MAX_TRADE_BATCH`] ids are supplied.
    ///
    /// Footprint: one persistent read per id, no writes and no instance-TTL
    /// bump — see `docs/gas-estimation.md` for the measured cost.
    pub fn get_trades(env: Env, ids: Vec<u64>) -> Vec<Option<Trade>> {
        if ids.len() > MAX_TRADE_BATCH {
            panic_with_error!(&env, EscrowError::BatchTooLarge);
        }

        let mut trades: Vec<Option<Trade>> = Vec::new(&env);
        for trade_id in ids.iter() {
            let trade = env
                .storage()
                .persistent()
                .get::<_, TradeData>(&DataKey::Trade(trade_id))
                .map(|data| match data {
                    TradeData::V0(t) => t,
                });
            trades.push_back(trade);
        }
        trades
    }

    /// Returns the chronological list of stored events for a trade.
    /// Returns an empty Vec if the trade has no recorded events or does not exist.
    pub fn get_trade_history(env: Env, trade_id: u64) -> soroban_sdk::Vec<TradeEvent> {
        env.storage()
            .persistent()
            .get(&DataKey::TradeHistory(trade_id))
            .unwrap_or_else(|| soroban_sdk::Vec::new(&env))
    }

    pub fn get_contract_metrics(env: Env) -> (u64, u64, u64) {
        let total_trades: u64 = env
            .storage()
            .instance()
            .get(&DataKey::TotalTrades)
            .unwrap_or(0);
        let total_disputes: u64 = env
            .storage()
            .instance()
            .get(&DataKey::TotalDisputes)
            .unwrap_or(0);
        let total_resolved: u64 = env
            .storage()
            .instance()
            .get(&DataKey::TotalResolved)
            .unwrap_or(0);
        (total_trades, total_disputes, total_resolved)
    }
}

// ---------------------------------------------------------------------------
// Internal trade helpers (not exported as contract functions)
// ---------------------------------------------------------------------------

impl EscrowContract {
    /// Extensions applied to `trade_id` so far. Absent storage means zero.
    pub(crate) fn extension_count(env: &Env, trade_id: u64) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::ExtensionCount(trade_id))
            .unwrap_or(0)
    }

    /// The trade's first deadline, once captured. `None` before the first
    /// extension.
    pub(crate) fn original_deadline(env: &Env, trade_id: u64) -> Option<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::OriginalDeadline(trade_id))
    }

    pub(crate) fn execute_cancellation(env: &Env, trade: &mut Trade, refund_amount: i128, caller: Address) {
        if refund_amount > 0 {
            let token_client = token::Client::new(env, &trade.token);
            token_client.transfer(
                &env.current_contract_address(),
                &trade.buyer,
                &refund_amount,
            );
        }

        trade.status = TradeStatus::Cancelled;
        trade.updated_at = env.ledger().timestamp();
        Self::save_trade(env, &DataKey::Trade(trade.trade_id), trade);
        Self::update_release_sequence(env, trade, |sequence, at| {
            sequence.cancelled_at = Some(at);
        });

        Self::record_trade_event(
            env,
            trade.trade_id,
            "cancelled",
            caller.clone(),
            "trade cancelled",
        );
        TradeCancelledEvent {
            trade_id: trade.trade_id,
            refund_amount,
            caller,
            timestamp: env.ledger().timestamp(),
        }
        .publish(env);
    }
}
