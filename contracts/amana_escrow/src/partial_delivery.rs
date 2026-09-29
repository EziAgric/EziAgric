//! Partial delivery with pro-rata settlement (#349).
//!
//! Agricultural shipments often arrive short (e.g. 80 of 100 bags). Instead of
//! forcing every short shipment into a dispute, the buyer proposes the
//! delivered share and the seller accepts it within a window:
//!
//! 1. `confirm_partial_delivery(trade_id, delivered_bps)` — buyer, trade `Funded`.
//! 2. `accept_partial_delivery(trade_id)` — seller, before `accept_by`. Settles:
//!    the delivered share goes to the seller (minus the platform fee, which is
//!    charged on the delivered share only) and the undelivered remainder is
//!    split by the trade's loss ratio. See [`crate::partial_delivery_split`].
//! 3. `escalate_partial_delivery(trade_id, caller)` — the seller at any time
//!    (rejecting the proposal) or the buyer once `accept_by` has passed. Moves
//!    the trade into the regular dispute flow.

use soroban_sdk::{Address, Env, String, contractimpl, token};

use crate::*;

/// `reason_hash` recorded on the dispute opened by `escalate_partial_delivery`.
pub const PARTIAL_DELIVERY_DISPUTE_REASON: &str = "partial_delivery_not_accepted";

#[contractimpl]
impl EscrowContract {
    /// Buyer reports that only `delivered_bps` of the shipment arrived and
    /// proposes a pro-rata settlement. The seller then has
    /// [`PARTIAL_DELIVERY_ACCEPT_WINDOW_SECS`] to accept it.
    ///
    /// Reverts if:
    /// - The contract is paused.
    /// - The trade is not in `Funded` status.
    /// - `delivered_bps` exceeds 10_000.
    /// - A partial delivery is already pending for the trade.
    pub fn confirm_partial_delivery(env: Env, trade_id: u64, delivered_bps: u32) {
        Self::assert_not_paused(&env);
        let trade: Trade = Self::load_trade(&env, &DataKey::Trade(trade_id));
        trade.buyer.require_auth();

        assert!(
            matches!(trade.status, TradeStatus::Funded),
            "Trade must be funded"
        );
        assert!(
            delivered_bps <= BPS_DIVISOR as u32,
            "delivered_bps must be <= 10_000"
        );

        let proposal_key = DataKey::PartialDelivery(trade_id);
        assert!(
            !env.storage().persistent().has(&proposal_key),
            "Partial delivery already pending"
        );

        let now = env.ledger().timestamp();
        let accept_by = now
            .checked_add(PARTIAL_DELIVERY_ACCEPT_WINDOW_SECS)
            .expect("accept_by overflow");
        let proposal = PartialDeliveryProposal {
            trade_id,
            delivered_bps,
            proposed_at: now,
            accept_by,
        };
        env.storage().persistent().set(&proposal_key, &proposal);

        Self::record_trade_event(
            &env,
            trade_id,
            "partial_delivery_proposed",
            trade.buyer.clone(),
            "partial delivery proposed",
        );
        PartialDeliveryProposedEvent {
            trade_id,
            buyer: trade.buyer,
            delivered_bps,
            accept_by,
            schema_version: EVENT_SCHEMA_VERSION,
        }
        .publish(&env);
        Self::bump_instance_ttl(&env);
    }

    /// Seller accepts the buyer's pending partial-delivery proposal and the
    /// escrow is settled pro-rata. Emits `PARTDL` with every amount moved.
    ///
    /// Reverts if:
    /// - The contract is paused.
    /// - The trade is not in `Funded` status.
    /// - No partial delivery is pending.
    /// - The acceptance window has closed (escalate instead).
    pub fn accept_partial_delivery(env: Env, trade_id: u64) {
        Self::assert_not_paused(&env);
        let key = DataKey::Trade(trade_id);
        let mut trade: Trade = Self::load_trade(&env, &key);
        trade.seller.require_auth();

        assert!(
            matches!(trade.status, TradeStatus::Funded),
            "Trade must be funded"
        );

        let proposal_key = DataKey::PartialDelivery(trade_id);
        let proposal: PartialDeliveryProposal = env
            .storage()
            .persistent()
            .get(&proposal_key)
            .expect("No partial delivery pending");

        let now = env.ledger().timestamp();
        assert!(
            now <= proposal.accept_by,
            "Partial delivery acceptance window has closed"
        );

        let fee_bps: u32 = env.storage().instance().get(&DataKey::FeeBps).unwrap_or(0);
        let total = trade.amount;
        let (delivered_amount, undelivered_amount, seller_amount, buyer_refund, fee_amount) =
            partial_delivery_split(
                total,
                proposal.delivered_bps,
                trade.seller_loss_bps,
                fee_bps,
            );

        // Invariants: all payouts non-negative and sum to the escrowed balance.
        assert!(seller_amount >= 0, "seller_amount must be non-negative");
        assert!(buyer_refund >= 0, "buyer_refund must be non-negative");
        assert!(fee_amount >= 0, "fee_amount must be non-negative");
        assert!(
            seller_amount + buyer_refund + fee_amount == total,
            "accept_partial_delivery: cNGN conservation invariant violated"
        );

        let token_client = token::Client::new(&env, &trade.token);
        if seller_amount > 0 {
            token_client.transfer(
                &env.current_contract_address(),
                &trade.seller,
                &seller_amount,
            );
        }
        if buyer_refund > 0 {
            token_client.transfer(
                &env.current_contract_address(),
                &trade.buyer,
                &buyer_refund,
            );
        }
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

        trade.status = TradeStatus::Completed;
        trade.delivered_at = Some(now);
        trade.updated_at = now;
        Self::save_trade(&env, &key, &trade);
        Self::update_release_sequence(&env, &trade, |sequence, at| {
            sequence.delivered_at = Some(at);
            sequence.released_at = Some(at);
        });
        env.storage().persistent().remove(&proposal_key);

        Self::record_trade_event(
            &env,
            trade_id,
            "partial_delivery_settled",
            trade.seller.clone(),
            "partial delivery settled pro-rata",
        );
        PartialDeliverySettledEvent {
            trade_id,
            delivered_bps: proposal.delivered_bps,
            delivered_amount,
            undelivered_amount,
            seller_amount,
            buyer_refund,
            fee_amount,
            schema_version: EVENT_SCHEMA_VERSION,
        }
        .publish(&env);
        Self::bump_instance_ttl(&env);
    }

    /// Escalate a pending partial-delivery proposal to a regular dispute.
    ///
    /// The seller may call this at any time to reject the proposal; the buyer
    /// may call it once the acceptance window has closed without a response.
    /// The trade moves to `Disputed` exactly as `initiate_dispute` would, with
    /// [`PARTIAL_DELIVERY_DISPUTE_REASON`] as the recorded reason.
    pub fn escalate_partial_delivery(env: Env, trade_id: u64, caller: Address) {
        let trade: Trade = Self::load_trade(&env, &DataKey::Trade(trade_id));
        let proposal_key = DataKey::PartialDelivery(trade_id);
        let proposal: PartialDeliveryProposal = env
            .storage()
            .persistent()
            .get(&proposal_key)
            .expect("No partial delivery pending");

        let now = env.ledger().timestamp();
        if caller == trade.buyer {
            assert!(
                now > proposal.accept_by,
                "Seller acceptance window is still open"
            );
        } else {
            assert!(
                caller == trade.seller,
                "Only the buyer or seller can escalate a partial delivery"
            );
        }

        // `initiate_dispute` performs the caller auth and the Funded check.
        Self::initiate_dispute(
            env.clone(),
            trade_id,
            caller,
            String::from_str(&env, PARTIAL_DELIVERY_DISPUTE_REASON),
        );
        env.storage().persistent().remove(&proposal_key);
        Self::bump_instance_ttl(&env);
    }

    /// The pending partial-delivery proposal for a trade, if any. Returns
    /// `None` once the proposal has been settled or escalated, or when the
    /// trade has since left `Funded` status by another path.
    pub fn get_partial_delivery(env: Env, trade_id: u64) -> Option<PartialDeliveryProposal> {
        let proposal: Option<PartialDeliveryProposal> = env
            .storage()
            .persistent()
            .get(&DataKey::PartialDelivery(trade_id));
        proposal.filter(|_| {
            matches!(
                Self::load_trade(&env, &DataKey::Trade(trade_id)).status,
                TradeStatus::Funded
            )
        })
    }
}
