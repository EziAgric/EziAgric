//! Issue #353 — mutual-consent trade amendment before funding.
extern crate std;

use amana_escrow::{TradeStatus, test_fixture::AdminSignerFixture};
use soroban_sdk::{
    Address, Env, IntoVal, Val,
    testutils::{Ledger, MockAuth, MockAuthInvoke},
};

type Harness = AdminSignerFixture;

fn create_trade(h: &Harness) -> u64 {
    h.client().create_trade(
        &h.buyer,
        &h.seller,
        &1_000i128,
        &5000u32,
        &5000u32,
        &None,
    )
}

fn propose(h: &Harness, trade_id: u64, proposer: &Address) {
    h.client()
        .propose_amendment(&trade_id, proposer, &800i128, &3000u32, &7000u32, &Some(10_000u64));
}

#[test]
fn amendment_applies_only_after_counter_party_accepts() {
    let h = Harness::new();
    let trade_id = create_trade(&h);

    propose(&h, trade_id, &h.seller);

    // Proposal alone does not change the trade.
    let trade = h.client().get_trade(&trade_id);
    assert_eq!(trade.amount, 1_000);
    assert_eq!(trade.buyer_loss_bps, 5000);
    assert_eq!(trade.expires_at, None);
    let pending = h.client().get_pending_amendment(&trade_id).unwrap();
    assert_eq!(pending.proposer, h.seller);
    assert_eq!(pending.amount, 800);

    h.client().accept_amendment(&trade_id, &h.buyer);

    let trade = h.client().get_trade(&trade_id);
    assert_eq!(trade.amount, 800);
    assert_eq!(trade.buyer_loss_bps, 3000);
    assert_eq!(trade.seller_loss_bps, 7000);
    assert_eq!(trade.expires_at, Some(10_000));
    assert!(matches!(trade.status, TradeStatus::Created));
    assert!(h.client().get_pending_amendment(&trade_id).is_none());

    // Funding now escrows the amended amount.
    h.mint(&h.buyer, 800);
    h.client().deposit(&trade_id);
    assert_eq!(h.token().balance(&h.contract_id), 800);
}

#[test]
fn buyer_may_propose_and_seller_accept() {
    let h = Harness::new();
    let trade_id = create_trade(&h);

    propose(&h, trade_id, &h.buyer);
    h.client().accept_amendment(&trade_id, &h.seller);

    assert_eq!(h.client().get_trade(&trade_id).amount, 800);
}

#[test]
#[should_panic(expected = "AMENDMENT_SELF_ACCEPT")]
fn proposer_cannot_accept_own_amendment() {
    let h = Harness::new();
    let trade_id = create_trade(&h);
    propose(&h, trade_id, &h.seller);

    h.client().accept_amendment(&trade_id, &h.seller);
}

#[test]
#[should_panic(expected = "AMENDMENT_UNAUTHORIZED")]
fn stranger_cannot_propose() {
    let h = Harness::new();
    let trade_id = create_trade(&h);

    propose(&h, trade_id, &h.stranger);
}

#[test]
#[should_panic(expected = "AMENDMENT_UNAUTHORIZED")]
fn stranger_cannot_accept() {
    let h = Harness::new();
    let trade_id = create_trade(&h);
    propose(&h, trade_id, &h.seller);

    h.client().accept_amendment(&trade_id, &h.stranger);
}

#[test]
fn accept_requires_the_counter_party_signature() {
    let h = Harness::new();
    let trade_id = create_trade(&h);
    propose(&h, trade_id, &h.seller);

    // Only the seller signs, but the call names the buyer as acceptor.
    let result = h
        .client()
        .mock_auths(&[MockAuth {
            address: &h.seller,
            invoke: &MockAuthInvoke {
                contract: &h.contract_id,
                fn_name: "accept_amendment",
                args: soroban_sdk::vec![
                    &h.env,
                    IntoVal::<Env, Val>::into_val(&trade_id, &h.env),
                    IntoVal::<Env, Val>::into_val(&h.buyer, &h.env),
                ],
                sub_invokes: &[],
            },
        }])
        .try_accept_amendment(&trade_id, &h.buyer);
    assert!(result.is_err());
    assert_eq!(h.client().get_trade(&trade_id).amount, 1_000);
}

#[test]
#[should_panic(expected = "AMENDMENT_INVALID_STATUS")]
fn cannot_propose_on_funded_trade() {
    let h = Harness::new();
    let trade_id = h.funded_trade(1_000);

    propose(&h, trade_id, &h.seller);
}

#[test]
fn funding_before_acceptance_wins_the_race() {
    let h = Harness::new();
    let trade_id = create_trade(&h);
    propose(&h, trade_id, &h.seller);

    // Buyer funds at the original terms before accepting the amendment.
    h.mint(&h.buyer, 1_000);
    h.client().deposit(&trade_id);

    let result = h.client().try_accept_amendment(&trade_id, &h.buyer);
    assert!(result.is_err(), "amendment must not apply to a funded trade");

    let trade = h.client().get_trade(&trade_id);
    assert!(matches!(trade.status, TradeStatus::Funded));
    assert_eq!(trade.amount, 1_000);
    assert_eq!(trade.buyer_loss_bps, 5000);
    assert_eq!(h.token().balance(&h.contract_id), 1_000);
}

#[test]
#[should_panic(expected = "AMENDMENT_ALREADY_PENDING")]
fn second_proposal_requires_withdrawing_the_first() {
    let h = Harness::new();
    let trade_id = create_trade(&h);
    propose(&h, trade_id, &h.seller);

    h.client()
        .propose_amendment(&trade_id, &h.seller, &2_000i128, &5000u32, &5000u32, &None);
}

#[test]
fn proposer_can_withdraw_and_repropose() {
    let h = Harness::new();
    let trade_id = create_trade(&h);
    propose(&h, trade_id, &h.seller);

    h.client().withdraw_amendment(&trade_id, &h.seller);
    assert!(h.client().get_pending_amendment(&trade_id).is_none());
    assert!(h.client().try_accept_amendment(&trade_id, &h.buyer).is_err());

    h.client()
        .propose_amendment(&trade_id, &h.seller, &2_000i128, &5000u32, &5000u32, &None);
    h.client().accept_amendment(&trade_id, &h.buyer);
    assert_eq!(h.client().get_trade(&trade_id).amount, 2_000);
}

#[test]
fn counter_party_can_reject_by_withdrawing() {
    let h = Harness::new();
    let trade_id = create_trade(&h);
    propose(&h, trade_id, &h.seller);

    h.client().withdraw_amendment(&trade_id, &h.buyer);

    assert!(h.client().get_pending_amendment(&trade_id).is_none());
    assert_eq!(h.client().get_trade(&trade_id).amount, 1_000);
}

#[test]
#[should_panic(expected = "AMENDMENT_NOT_FOUND")]
fn withdraw_without_pending_amendment_fails() {
    let h = Harness::new();
    let trade_id = create_trade(&h);

    h.client().withdraw_amendment(&trade_id, &h.seller);
}

#[test]
#[should_panic(expected = "INVALID_LOSS_RATIO")]
fn proposal_with_invalid_loss_ratio_fails() {
    let h = Harness::new();
    let trade_id = create_trade(&h);

    h.client()
        .propose_amendment(&trade_id, &h.seller, &800i128, &5000u32, &5001u32, &None);
}

#[test]
#[should_panic(expected = "AMENDMENT_INVALID_AMOUNT")]
fn proposal_with_zero_amount_fails() {
    let h = Harness::new();
    let trade_id = create_trade(&h);

    h.client()
        .propose_amendment(&trade_id, &h.seller, &0i128, &5000u32, &5000u32, &None);
}

#[test]
#[should_panic(expected = "AMENDMENT_INVALID_DEADLINE")]
fn accept_rejects_a_deadline_that_has_since_passed() {
    let h = Harness::new();
    let trade_id = create_trade(&h);
    propose(&h, trade_id, &h.seller);

    h.env.ledger().with_mut(|l| l.timestamp = 10_000);

    h.client().accept_amendment(&trade_id, &h.buyer);
}
