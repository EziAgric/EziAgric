/// Issue #349 — partial delivery with pro-rata settlement.
///
/// Covers:
///   1. Settlement amounts at 0, 1, 5000 and 10000 delivered bps
///   2. Amounts always sum exactly to the escrowed balance (no dust lost)
///   3. The platform fee is charged on the delivered portion only
///   4. Loss ratio applied to the undelivered remainder
///   5. Seller acceptance window and escalation to dispute
///   6. PARTDL event emission
#[cfg(test)]
mod partial_delivery_tests {
    extern crate std;

    use crate::test_fixture::admin_address;
    use crate::{
        EscrowContract, EscrowContractClient, PARTIAL_DELIVERY_ACCEPT_WINDOW_SECS,
        PARTIAL_DELIVERY_DISPUTE_REASON, TradeStatus,
    };
    use soroban_sdk::{
        Address, Env, String, Symbol, TryFromVal, Val,
        testutils::{Address as _, Events as _, Ledger as _},
        token,
        xdr::{ContractEventBody, ScVal},
    };

    const TOTAL: i128 = 10_000;
    const FEE_BPS: u32 = 100; // 1% platform fee

    struct Ctx {
        env: Env,
        contract_id: Address,
        token_id: Address,
        buyer: Address,
        seller: Address,
    }

    impl Ctx {
        fn new() -> Self {
            let env = Env::default();
            env.mock_all_auths();
            let admin = admin_address(&env);
            let buyer = Address::generate(&env);
            let seller = Address::generate(&env);
            let treasury = Address::generate(&env);
            let contract_id = env.register(EscrowContract, ());
            let token_id = env
                .register_stellar_asset_contract_v2(admin.clone())
                .address();
            token::StellarAssetClient::new(&env, &token_id).mint(&buyer, &(TOTAL * 10));
            EscrowContractClient::new(&env, &contract_id).initialize(
                &admin, &token_id, &treasury, &FEE_BPS, &token_id,
            );
            Ctx {
                env,
                contract_id,
                token_id,
                buyer,
                seller,
            }
        }

        fn client(&self) -> EscrowContractClient<'_> {
            EscrowContractClient::new(&self.env, &self.contract_id)
        }

        fn token(&self) -> token::Client<'_> {
            token::Client::new(&self.env, &self.token_id)
        }

        fn funded_trade(&self, amount: i128, buyer_loss_bps: u32, seller_loss_bps: u32) -> u64 {
            let client = self.client();
            let trade_id = client.create_trade(
                &self.buyer,
                &self.seller,
                &amount,
                &buyer_loss_bps,
                &seller_loss_bps,
                &Some(self.env.ledger().timestamp() + 30 * 24 * 60 * 60),
            );
            client.deposit(&trade_id);
            trade_id
        }
    }

    /// Proposes and accepts a partial delivery, then checks every balance
    /// movement against the expected split and the conservation invariant.
    fn settle_and_check(
        amount: i128,
        delivered_bps: u32,
        buyer_loss_bps: u32,
        seller_loss_bps: u32,
        expected_seller: i128,
        expected_buyer_refund: i128,
        expected_fee: i128,
    ) {
        let ctx = Ctx::new();
        let client = ctx.client();
        let tok = ctx.token();
        let trade_id = ctx.funded_trade(amount, buyer_loss_bps, seller_loss_bps);

        let buyer_before = tok.balance(&ctx.buyer);
        let fees_before = client.get_accrued_fees();

        client.confirm_partial_delivery(&trade_id, &delivered_bps);
        client.accept_partial_delivery(&trade_id);

        let seller_got = tok.balance(&ctx.seller);
        let buyer_got = tok.balance(&ctx.buyer) - buyer_before;
        let fee = client.get_accrued_fees() - fees_before;

        assert_eq!(seller_got, expected_seller, "seller amount");
        assert_eq!(buyer_got, expected_buyer_refund, "buyer refund");
        assert_eq!(fee, expected_fee, "fee amount");
        assert_eq!(
            seller_got + buyer_got + fee,
            amount,
            "amounts must sum exactly to the escrowed balance"
        );
        // Only the accrued fee remains in the contract.
        assert_eq!(tok.balance(&ctx.contract_id), fee);

        let trade = client.get_trade(&trade_id);
        assert_eq!(trade.status, TradeStatus::Completed);
        assert!(trade.delivered_at.is_some());
        assert_eq!(client.get_partial_delivery(&trade_id), None);
        let sequence = client.get_release_sequence(&trade_id);
        assert!(sequence.delivered_at.is_some());
        assert!(sequence.released_at.is_some());
    }

    // -----------------------------------------------------------------------
    // Settlement math — 50/50 loss ratio, 1% fee
    // -----------------------------------------------------------------------

    #[test]
    fn test_partial_delivery_0_bps() {
        // Nothing arrived: no fee, the undelivered 10_000 is split 50/50.
        settle_and_check(TOTAL, 0, 5_000, 5_000, 5_000, 5_000, 0);
    }

    #[test]
    fn test_partial_delivery_1_bps() {
        // delivered = 1, fee = 1 * 1% = 0 (floored), undelivered = 9_999
        // buyer_refund = 9_999 * 50% = 4_999 (floored); the half-unit of dust
        // stays with the seller so nothing is lost.
        settle_and_check(TOTAL, 1, 5_000, 5_000, 5_001, 4_999, 0);
    }

    #[test]
    fn test_partial_delivery_5000_bps() {
        // delivered = 5_000, fee = 50, undelivered = 5_000, refund = 2_500
        // seller = 10_000 - 2_500 - 50 = 7_450
        settle_and_check(TOTAL, 5_000, 5_000, 5_000, 7_450, 2_500, 50);
    }

    #[test]
    fn test_partial_delivery_10000_bps_matches_full_release() {
        // Full delivery: identical to release_funds — 1% fee, no refund.
        settle_and_check(TOTAL, 10_000, 5_000, 5_000, 9_900, 0, 100);
    }

    #[test]
    fn test_partial_delivery_seller_bears_all_loss() {
        // 80 of 100 bags; seller bears 100% of the shortfall.
        // delivered = 8_000, fee = 80, refund = 2_000, seller = 7_920
        settle_and_check(TOTAL, 8_000, 0, 10_000, 7_920, 2_000, 80);
    }

    #[test]
    fn test_partial_delivery_buyer_bears_all_loss() {
        // Buyer bears the shortfall: nothing is refunded, fee still only on
        // the delivered 8_000.
        settle_and_check(TOTAL, 8_000, 10_000, 0, 9_920, 0, 80);
    }

    #[test]
    fn test_partial_delivery_conserves_odd_amounts() {
        // amount 9_999, delivered 33.33%, seller bears 30% of the loss.
        // delivered = 9_999 * 3_333 / 10_000 = 3_332
        // fee       = 3_332 * 100 / 10_000   = 33
        // refund    = 6_667 * 3_000 / 10_000 = 2_000
        // seller    = 9_999 - 2_000 - 33     = 7_966
        settle_and_check(9_999, 3_333, 7_000, 3_000, 7_966, 2_000, 33);
    }

    #[test]
    fn test_partial_delivery_fee_only_on_delivered_portion() {
        // Compare against a full release of the same trade size: the partial
        // fee is exactly delivered_bps of the full-release fee.
        settle_and_check(TOTAL, 2_500, 5_000, 5_000, 6_225, 3_750, 25);
    }

    // -----------------------------------------------------------------------
    // Proposal validation
    // -----------------------------------------------------------------------

    #[test]
    fn test_confirm_partial_delivery_stores_proposal() {
        let ctx = Ctx::new();
        let client = ctx.client();
        let trade_id = ctx.funded_trade(TOTAL, 5_000, 5_000);
        let now = ctx.env.ledger().timestamp();

        client.confirm_partial_delivery(&trade_id, &8_000_u32);

        let proposal = client.get_partial_delivery(&trade_id).unwrap();
        assert_eq!(proposal.trade_id, trade_id);
        assert_eq!(proposal.delivered_bps, 8_000);
        assert_eq!(proposal.proposed_at, now);
        assert_eq!(proposal.accept_by, now + PARTIAL_DELIVERY_ACCEPT_WINDOW_SECS);
        // Funds stay in escrow until the seller accepts.
        assert_eq!(client.get_trade(&trade_id).status, TradeStatus::Funded);
        assert_eq!(ctx.token().balance(&ctx.contract_id), TOTAL);
    }

    #[test]
    #[should_panic(expected = "delivered_bps must be <= 10_000")]
    fn test_confirm_partial_delivery_rejects_over_10000_bps() {
        let ctx = Ctx::new();
        let trade_id = ctx.funded_trade(TOTAL, 5_000, 5_000);
        ctx.client().confirm_partial_delivery(&trade_id, &10_001_u32);
    }

    #[test]
    #[should_panic(expected = "Trade must be funded")]
    fn test_confirm_partial_delivery_rejects_unfunded_trade() {
        let ctx = Ctx::new();
        let client = ctx.client();
        let trade_id = client.create_trade(
            &ctx.buyer,
            &ctx.seller,
            &TOTAL,
            &5_000_u32,
            &5_000_u32,
            &None,
        );
        client.confirm_partial_delivery(&trade_id, &5_000_u32);
    }

    #[test]
    #[should_panic(expected = "Partial delivery already pending")]
    fn test_confirm_partial_delivery_rejects_second_proposal() {
        let ctx = Ctx::new();
        let client = ctx.client();
        let trade_id = ctx.funded_trade(TOTAL, 5_000, 5_000);
        client.confirm_partial_delivery(&trade_id, &5_000_u32);
        client.confirm_partial_delivery(&trade_id, &6_000_u32);
    }

    #[test]
    #[should_panic(expected = "No partial delivery pending")]
    fn test_accept_without_proposal_panics() {
        let ctx = Ctx::new();
        let trade_id = ctx.funded_trade(TOTAL, 5_000, 5_000);
        ctx.client().accept_partial_delivery(&trade_id);
    }

    // -----------------------------------------------------------------------
    // Acceptance window & escalation
    // -----------------------------------------------------------------------

    #[test]
    fn test_accept_on_last_second_of_window_succeeds() {
        let ctx = Ctx::new();
        let client = ctx.client();
        let trade_id = ctx.funded_trade(TOTAL, 5_000, 5_000);
        client.confirm_partial_delivery(&trade_id, &5_000_u32);

        let accept_by = client.get_partial_delivery(&trade_id).unwrap().accept_by;
        ctx.env.ledger().with_mut(|l| l.timestamp = accept_by);
        client.accept_partial_delivery(&trade_id);
        assert_eq!(client.get_trade(&trade_id).status, TradeStatus::Completed);
    }

    #[test]
    #[should_panic(expected = "Partial delivery acceptance window has closed")]
    fn test_accept_after_window_panics() {
        let ctx = Ctx::new();
        let client = ctx.client();
        let trade_id = ctx.funded_trade(TOTAL, 5_000, 5_000);
        client.confirm_partial_delivery(&trade_id, &5_000_u32);

        let accept_by = client.get_partial_delivery(&trade_id).unwrap().accept_by;
        ctx.env.ledger().with_mut(|l| l.timestamp = accept_by + 1);
        client.accept_partial_delivery(&trade_id);
    }

    #[test]
    fn test_seller_can_reject_by_escalating_to_dispute() {
        let ctx = Ctx::new();
        let client = ctx.client();
        let trade_id = ctx.funded_trade(TOTAL, 5_000, 5_000);
        client.confirm_partial_delivery(&trade_id, &5_000_u32);

        client.escalate_partial_delivery(&trade_id, &ctx.seller);

        assert_eq!(client.get_trade(&trade_id).status, TradeStatus::Disputed);
        let record = client.get_dispute_record(&trade_id).unwrap();
        assert_eq!(record.initiator, ctx.seller);
        assert_eq!(
            record.reason_hash,
            String::from_str(&ctx.env, PARTIAL_DELIVERY_DISPUTE_REASON)
        );
        assert_eq!(client.get_partial_delivery(&trade_id), None);
        // Escrow untouched — the dispute flow decides the split.
        assert_eq!(ctx.token().balance(&ctx.contract_id), TOTAL);
    }

    #[test]
    fn test_buyer_escalates_after_window_expires() {
        let ctx = Ctx::new();
        let client = ctx.client();
        let trade_id = ctx.funded_trade(TOTAL, 5_000, 5_000);
        client.confirm_partial_delivery(&trade_id, &5_000_u32);

        let accept_by = client.get_partial_delivery(&trade_id).unwrap().accept_by;
        ctx.env.ledger().with_mut(|l| l.timestamp = accept_by + 1);
        client.escalate_partial_delivery(&trade_id, &ctx.buyer);

        assert_eq!(client.get_trade(&trade_id).status, TradeStatus::Disputed);
        assert_eq!(
            client.get_dispute_record(&trade_id).unwrap().initiator,
            ctx.buyer
        );
    }

    #[test]
    #[should_panic(expected = "Seller acceptance window is still open")]
    fn test_buyer_cannot_escalate_inside_window() {
        let ctx = Ctx::new();
        let client = ctx.client();
        let trade_id = ctx.funded_trade(TOTAL, 5_000, 5_000);
        client.confirm_partial_delivery(&trade_id, &5_000_u32);
        client.escalate_partial_delivery(&trade_id, &ctx.buyer);
    }

    #[test]
    #[should_panic(expected = "Only the buyer or seller can escalate a partial delivery")]
    fn test_stranger_cannot_escalate() {
        let ctx = Ctx::new();
        let client = ctx.client();
        let trade_id = ctx.funded_trade(TOTAL, 5_000, 5_000);
        client.confirm_partial_delivery(&trade_id, &5_000_u32);
        client.escalate_partial_delivery(&trade_id, &Address::generate(&ctx.env));
    }

    #[test]
    #[should_panic(expected = "Partial delivery pending; accept or escalate it instead")]
    fn test_expiry_refund_blocked_while_partial_delivery_pending() {
        let ctx = Ctx::new();
        let client = ctx.client();
        let trade_id = ctx.funded_trade(TOTAL, 5_000, 5_000);
        client.confirm_partial_delivery(&trade_id, &5_000_u32);

        let deadline = client.get_trade(&trade_id).expires_at.unwrap();
        ctx.env.ledger().with_mut(|l| l.timestamp = deadline + 1);
        client.claim_expiry_refund(&trade_id, &ctx.buyer);
    }

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    #[test]
    fn test_accept_emits_partdl_event() {
        let ctx = Ctx::new();
        let client = ctx.client();
        let trade_id = ctx.funded_trade(TOTAL, 5_000, 5_000);
        client.confirm_partial_delivery(&trade_id, &5_000_u32);
        client.accept_partial_delivery(&trade_id);

        let all = ctx.env.events().all();
        let events = all.events();
        let last = events.last().expect("no events emitted");
        let topics = match &last.body {
            ContractEventBody::V0(v0) => &v0.topics,
        };
        let expected: Val = Symbol::new(&ctx.env, "PARTDL").to_val();
        assert_eq!(topics.len(), 1);
        assert_eq!(
            topics.get(0).unwrap(),
            &ScVal::try_from_val(&ctx.env, &expected).unwrap()
        );
    }
}
