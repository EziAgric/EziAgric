//! Issue #352 — seller-initiated cancellation before funding.
extern crate std;

use amana_escrow::{TradeStatus, test_fixture::AdminSignerFixture};
use soroban_sdk::{
    Env, IntoVal, TryIntoVal, Val, symbol_short,
    testutils::{Events as _, MockAuth, MockAuthInvoke},
    xdr::ContractEventBody,
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

#[test]
fn cancel_by_seller_cancels_created_trade_and_emits_event() {
    let h = Harness::new();
    let trade_id = create_trade(&h);

    h.client().cancel_by_seller(&trade_id);

    let all_events = h.env.events().all();
    let events = all_events.events();
    let event = events.last().expect("cancel event should be emitted");
    match &event.body {
        ContractEventBody::V0(v0) => {
            let expected: soroban_sdk::xdr::ScVal =
                IntoVal::<Env, Val>::into_val(&symbol_short!("TCNBSL"), &h.env)
                    .try_into_val(&h.env)
                    .unwrap();
            assert_eq!(v0.topics.first().unwrap(), &expected);
            match &v0.data {
                soroban_sdk::xdr::ScVal::Vec(Some(payload)) => assert_eq!(payload.len(), 2),
                soroban_sdk::xdr::ScVal::Map(Some(payload)) => assert_eq!(payload.len(), 2),
                other => panic!("expected vec or map event payload, got {other:?}"),
            }
        }
    }

    let trade = h.client().get_trade(&trade_id);
    assert!(matches!(trade.status, TradeStatus::Cancelled));
    assert!(h.client().get_release_sequence(&trade_id).cancelled_at.is_some());
}

#[test]
#[should_panic(expected = "SELLER_CANCEL_INVALID_STATUS")]
fn cancel_by_seller_rejects_funded_trade() {
    let h = Harness::new();
    let trade_id = h.funded_trade(1_000);

    h.client().cancel_by_seller(&trade_id);
}

#[test]
#[should_panic(expected = "SELLER_CANCEL_INVALID_STATUS")]
fn cancel_by_seller_rejects_already_cancelled_trade() {
    let h = Harness::new();
    let trade_id = create_trade(&h);
    h.client().cancel_by_buyer(&trade_id);

    h.client().cancel_by_seller(&trade_id);
}

#[test]
fn cancel_by_seller_rejects_wrong_signer() {
    let h = Harness::new();
    let trade_id = create_trade(&h);

    for signer in [&h.buyer, &h.stranger] {
        let result = h
            .client()
            .mock_auths(&[MockAuth {
                address: signer,
                invoke: &MockAuthInvoke {
                    contract: &h.contract_id,
                    fn_name: "cancel_by_seller",
                    args: soroban_sdk::vec![
                        &h.env,
                        IntoVal::<Env, Val>::into_val(&trade_id, &h.env),
                    ],
                    sub_invokes: &[],
                },
            }])
            .try_cancel_by_seller(&trade_id);
        assert!(result.is_err(), "only the seller may cancel");
    }

    let trade = h.client().get_trade(&trade_id);
    assert!(matches!(trade.status, TradeStatus::Created));
}
