/// Issue #102 — Soroban contract integration test for admin clawback path.
///
/// This test suite covers the full end-to-end on-chain flow for admin clawback:
///
///   1. Contract deployment and initialization
///   2. Trade creation and funding
///   3. Admin clawback execution
///   4. Event emission verification
///   5. State update validation
///   6. Query method accuracy
///
/// Tests use Soroban SDK testutils to simulate full contract lifecycle.
extern crate std;

use amana_escrow::{
    ClawbackExecutedEvent, EscrowContract, EscrowContractClient, TradeStatus, EVENT_SCHEMA_VERSION,
};
use soroban_sdk::{testutils::Address as _, testutils::Events, token, Address, Env, IntoVal, Symbol};

// ---------------------------------------------------------------------------
// Test Harness
// ---------------------------------------------------------------------------

struct AdminTestHarness {
    env: Env,
    contract_id: Address,
    token_id: Address,
    admin: Address,
    buyer: Address,
    seller: Address,
    treasury: Address,
}

impl AdminTestHarness {
    fn new() -> Self {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let treasury = Address::generate(&env);

        let token_id = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();

        let contract_id = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &contract_id);

        client.initialize(&admin, &token_id, &treasury, &100u32, &token_id);

        AdminTestHarness {
            env,
            contract_id,
            token_id,
            admin,
            buyer,
            seller,
            treasury,
        }
    }

    fn client(&self) -> EscrowContractClient<'_> {
        EscrowContractClient::new(&self.env, &self.contract_id)
    }

    fn token(&self) -> token::Client<'_> {
        token::Client::new(&self.env, &self.token_id)
    }

    fn mint(&self, to: &Address, amount: i128) {
        token::StellarAssetClient::new(&self.env, &self.token_id).mint(to, amount);
    }

    fn create_funded_trade(&self, amount: i128) -> u64 {
        self.mint(&self.buyer, amount);
        let trade_id = self.client().create_trade(
            &self.buyer,
            &self.seller,
            &amount,
            &5000u32,
            &5000u32,
            &None,
        );
        self.client().deposit(&trade_id);
        trade_id
    }
}

// ---------------------------------------------------------------------------
// Integration Tests
// ---------------------------------------------------------------------------

#[test]
fn test_admin_clawback_full_lifecycle() {
    let h = AdminTestHarness::new();
    let client = h.client();
    let token = h.token();

    let amount = 10_000_i128;
    let trade_id = h.create_funded_trade(amount);

    let initial_contract_balance = token.balance(&h.contract_id);
    let initial_buyer_balance = token.balance(&h.buyer);

    assert_eq!(initial_contract_balance, amount);
    assert_eq!(initial_buyer_balance, 0);

    client.admin_clawback(&trade_id, &amount, &h.buyer);

    let final_contract_balance = token.balance(&h.contract_id);
    let final_buyer_balance = token.balance(&h.buyer);

    assert_eq!(final_contract_balance, 0);
    assert_eq!(final_buyer_balance, amount);

    let trade = client.get_trade(&trade_id);
    assert_eq!(trade.status, TradeStatus::Cancelled);
    assert_eq!(trade.amount, 0);

    let clawback_total = client.get_clawback_total(&trade_id);
    assert_eq!(clawback_total, amount);
}

#[test]
fn test_admin_clawback_event_emission() {
    let h = AdminTestHarness::new();
    let client = h.client();

    let amount = 5_000_i128;
    let trade_id = h.create_funded_trade(amount);

    client.admin_clawback(&trade_id, &amount, &h.buyer);

    let events = h.env.events().all();
    let clawback_events: Vec<_> = events
        .iter()
        .filter(|e| {
            e.topics.first().map_or(false, |t| {
                t == &Symbol::new(&h.env, "CLWBCK").into_val(&h.env)
            })
        })
        .collect();

    assert_eq!(clawback_events.len(), 1, "Expected exactly one clawback event");

    let event = &clawback_events[0];
    let event_data: ClawbackExecutedEvent = event.data.clone().try_into_val(&h.env).unwrap();

    assert_eq!(event_data.trade_id, trade_id);
    assert_eq!(event_data.clawback_amount, amount);
    assert_eq!(event_data.remaining_amount, 0);
    assert_eq!(event_data.destination, h.buyer);
    assert_eq!(event_data.admin, h.admin);
    assert_eq!(event_data.schema_version, EVENT_SCHEMA_VERSION);
}

#[test]
fn test_admin_clawback_partial_flow() {
    let h = AdminTestHarness::new();
    let client = h.client();
    let token = h.token();

    let amount = 10_000_i128;
    let trade_id = h.create_funded_trade(amount);

    let first_clawback = 3_000_i128;
    client.admin_clawback(&trade_id, &first_clawback, &h.buyer);

    let trade_after_first = client.get_trade(&trade_id);
    assert_eq!(trade_after_first.status, TradeStatus::Funded);
    assert_eq!(trade_after_first.amount, amount - first_clawback);
    assert_eq!(client.get_clawback_total(&trade_id), first_clawback);

    let second_clawback = 7_000_i128;
    client.admin_clawback(&trade_id, &second_clawback, &h.buyer);

    let trade_after_second = client.get_trade(&trade_id);
    assert_eq!(trade_after_second.status, TradeStatus::Cancelled);
    assert_eq!(trade_after_second.amount, 0);
    assert_eq!(client.get_clawback_total(&trade_id), amount);

    let final_buyer_balance = token.balance(&h.buyer);
    assert_eq!(final_buyer_balance, amount);
}

#[test]
fn test_admin_clawback_state_query_methods() {
    let h = AdminTestHarness::new();
    let client = h.client();

    let amount = 8_000_i128;
    let trade_id = h.create_funded_trade(amount);

    let (original, claimed_before, clawed_before) = client.get_stream_accounting(&trade_id);
    assert_eq!(original, amount);
    assert_eq!(claimed_before, 0);
    assert_eq!(clawed_before, 0);

    let clawback_amt = 3_000_i128;
    client.admin_clawback(&trade_id, &clawback_amt, &h.treasury);

    let (original_after, claimed_after, clawed_after) = client.get_stream_accounting(&trade_id);
    assert_eq!(original_after, amount - clawback_amt);
    assert_eq!(claimed_after, 0);
    assert_eq!(clawed_after, clawback_amt);
}

#[test]
fn test_admin_clawback_multiple_events() {
    let h = AdminTestHarness::new();
    let client = h.client();

    let amount = 9_000_i128;
    let trade_id = h.create_funded_trade(amount);

    client.admin_clawback(&trade_id, &2_000, &h.buyer);
    client.admin_clawback(&trade_id, &3_000, &h.buyer);
    client.admin_clawback(&trade_id, &4_000, &h.buyer);

    let events = h.env.events().all();
    let clawback_events: Vec<_> = events
        .iter()
        .filter(|e| {
            e.topics.first().map_or(false, |t| {
                t == &Symbol::new(&h.env, "CLWBCK").into_val(&h.env)
            })
        })
        .collect();

    assert_eq!(clawback_events.len(), 3, "Expected three clawback events");

    let event1: ClawbackExecutedEvent = clawback_events[0].data.clone().try_into_val(&h.env).unwrap();
    let event2: ClawbackExecutedEvent = clawback_events[1].data.clone().try_into_val(&h.env).unwrap();
    let event3: ClawbackExecutedEvent = clawback_events[2].data.clone().try_into_val(&h.env).unwrap();

    assert_eq!(event1.clawback_amount, 2_000);
    assert_eq!(event1.remaining_amount, 7_000);

    assert_eq!(event2.clawback_amount, 3_000);
    assert_eq!(event2.remaining_amount, 4_000);

    assert_eq!(event3.clawback_amount, 4_000);
    assert_eq!(event3.remaining_amount, 0);
}

#[test]
fn test_admin_clawback_disputed_trade() {
    let h = AdminTestHarness::new();
    let client = h.client();
    let token = h.token();

    let amount = 6_000_i128;
    let trade_id = h.create_funded_trade(amount);

    let reason = soroban_sdk::String::from_str(&h.env, "QmDisputeReason");
    client.initiate_dispute(&trade_id, &h.buyer, &reason);

    let trade = client.get_trade(&trade_id);
    assert_eq!(trade.status, TradeStatus::Disputed);

    client.admin_clawback(&trade_id, &amount, &h.buyer);

    let final_trade = client.get_trade(&trade_id);
    assert_eq!(final_trade.status, TradeStatus::Cancelled);
    assert_eq!(token.balance(&h.buyer), amount);
    assert_eq!(token.balance(&h.contract_id), 0);
}

#[test]
fn test_admin_clawback_to_custom_destination() {
    let h = AdminTestHarness::new();
    let client = h.client();
    let token = h.token();

    let custom_destination = Address::generate(&h.env);
    let amount = 4_000_i128;
    let trade_id = h.create_funded_trade(amount);

    client.admin_clawback(&trade_id, &amount, &custom_destination);

    assert_eq!(token.balance(&custom_destination), amount);
    assert_eq!(token.balance(&h.buyer), 0);
    assert_eq!(token.balance(&h.contract_id), 0);
}

#[test]
#[should_panic(expected = "clawback_amount must be greater than zero")]
fn test_admin_clawback_rejects_zero_amount() {
    let h = AdminTestHarness::new();
    let client = h.client();

    let trade_id = h.create_funded_trade(5_000);
    client.admin_clawback(&trade_id, &0, &h.buyer);
}

#[test]
#[should_panic(expected = "clawback_amount exceeds remaining escrowed amount")]
fn test_admin_clawback_rejects_excessive_amount() {
    let h = AdminTestHarness::new();
    let client = h.client();

    let trade_id = h.create_funded_trade(5_000);
    client.admin_clawback(&trade_id, &10_000, &h.buyer);
}

#[test]
#[should_panic(expected = "Trade must be in Funded or Disputed status for clawback")]
fn test_admin_clawback_rejects_completed_trade() {
    let h = AdminTestHarness::new();
    let client = h.client();

    let amount = 5_000_i128;
    let trade_id = h.create_funded_trade(amount);

    client.confirm_delivery(&trade_id, &h.buyer);
    client.release_funds(&trade_id, &h.seller);

    client.admin_clawback(&trade_id, &amount, &h.buyer);
}

#[test]
fn test_admin_clawback_updates_trade_history() {
    let h = AdminTestHarness::new();
    let client = h.client();

    let amount = 7_000_i128;
    let trade_id = h.create_funded_trade(amount);

    client.admin_clawback(&trade_id, &amount, &h.buyer);

    let history = client.get_trade_history(&trade_id);
    let clawback_events: Vec<_> = history
        .iter()
        .filter(|e| e.event_type.to_string().contains("clawback"))
        .collect();

    assert!(
        !clawback_events.is_empty(),
        "Trade history should contain clawback event"
    );
}
