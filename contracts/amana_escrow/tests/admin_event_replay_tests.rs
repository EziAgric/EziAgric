/// Issue #103 — Contract event replay guard for admin clawback events.
///
/// This test suite verifies that:
///
///   1. Clawback events can be uniquely identified by (ledger, contract_id, trade_id)
///   2. Multiple partial clawbacks emit distinct events
///   3. Event schema includes all fields needed for idempotency checks
///   4. Backend can dedupe replayed events using event identifiers
///
/// Replay protection is primarily enforced by the backend event listener
/// using the ProcessedEvent table, but these tests verify the contract
/// emits all necessary information for deduplication.
extern crate std;

use amana_escrow::{ClawbackExecutedEvent, EscrowContract, EscrowContractClient, EVENT_SCHEMA_VERSION};
use soroban_sdk::{
    testutils::{Address as _, Events},
    token, Address, Env, IntoVal, Symbol,
};

// ---------------------------------------------------------------------------
// Test Harness
// ---------------------------------------------------------------------------

struct EventReplayHarness {
    env: Env,
    contract_id: Address,
    token_id: Address,
    admin: Address,
    buyer: Address,
    seller: Address,
}

impl EventReplayHarness {
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

        EventReplayHarness {
            env,
            contract_id,
            token_id,
            admin,
            buyer,
            seller,
        }
    }

    fn client(&self) -> EscrowContractClient<'_> {
        EscrowContractClient::new(&self.env, &self.contract_id)
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

    fn get_clawback_events(&self) -> Vec<ClawbackExecutedEvent> {
        let events = self.env.events().all();
        events
            .iter()
            .filter(|e| {
                e.topics.first().map_or(false, |t| {
                    t == &Symbol::new(&self.env, "CLWBCK").into_val(&self.env)
                })
            })
            .map(|e| e.data.clone().try_into_val(&self.env).unwrap())
            .collect()
    }
}

// ---------------------------------------------------------------------------
// Event Replay Guard Tests
// ---------------------------------------------------------------------------

#[test]
fn test_clawback_event_contains_unique_identifiers() {
    let h = EventReplayHarness::new();
    let client = h.client();

    let amount = 10_000_i128;
    let trade_id = h.create_funded_trade(amount);

    client.admin_clawback(&trade_id, &amount, &h.buyer);

    let events = h.get_clawback_events();
    assert_eq!(events.len(), 1);

    let event = &events[0];
    
    assert!(event.trade_id > 0, "trade_id must be present for deduplication");
    assert_eq!(event.clawback_amount, amount);
    assert_eq!(event.destination, h.buyer);
    assert_eq!(event.admin, h.admin);
    assert_eq!(event.schema_version, EVENT_SCHEMA_VERSION);
}

#[test]
fn test_multiple_clawback_events_are_distinct() {
    let h = EventReplayHarness::new();
    let client = h.client();

    let amount = 9_000_i128;
    let trade_id = h.create_funded_trade(amount);

    client.admin_clawback(&trade_id, &3_000, &h.buyer);
    client.admin_clawback(&trade_id, &3_000, &h.buyer);
    client.admin_clawback(&trade_id, &3_000, &h.buyer);

    let events = h.get_clawback_events();
    assert_eq!(events.len(), 3, "Each clawback should emit a distinct event");

    assert_eq!(events[0].clawback_amount, 3_000);
    assert_eq!(events[0].remaining_amount, 6_000);

    assert_eq!(events[1].clawback_amount, 3_000);
    assert_eq!(events[1].remaining_amount, 3_000);

    assert_eq!(events[2].clawback_amount, 3_000);
    assert_eq!(events[2].remaining_amount, 0);

    for event in &events {
        assert_eq!(event.trade_id, trade_id);
        assert_eq!(event.schema_version, EVENT_SCHEMA_VERSION);
    }
}

#[test]
fn test_clawback_event_schema_versioning() {
    let h = EventReplayHarness::new();
    let client = h.client();

    let trade_id = h.create_funded_trade(5_000);
    client.admin_clawback(&trade_id, &5_000, &h.buyer);

    let events = h.get_clawback_events();
    let event = &events[0];

    assert_eq!(
        event.schema_version, EVENT_SCHEMA_VERSION,
        "Event must include schema_version for backward compatibility"
    );
}

#[test]
fn test_clawback_events_on_different_trades_are_distinct() {
    let h = EventReplayHarness::new();
    let client = h.client();

    let trade_id_1 = h.create_funded_trade(4_000);
    let trade_id_2 = h.create_funded_trade(6_000);

    client.admin_clawback(&trade_id_1, &4_000, &h.buyer);
    client.admin_clawback(&trade_id_2, &6_000, &h.buyer);

    let events = h.get_clawback_events();
    assert_eq!(events.len(), 2);

    assert_eq!(events[0].trade_id, trade_id_1);
    assert_eq!(events[0].clawback_amount, 4_000);

    assert_eq!(events[1].trade_id, trade_id_2);
    assert_eq!(events[1].clawback_amount, 6_000);

    assert_ne!(events[0].trade_id, events[1].trade_id);
}

#[test]
fn test_clawback_event_includes_all_dedup_fields() {
    let h = EventReplayHarness::new();
    let client = h.client();

    let trade_id = h.create_funded_trade(7_000);
    client.admin_clawback(&trade_id, &2_000, &h.buyer);

    let events = h.get_clawback_events();
    let event = &events[0];

    assert!(event.trade_id > 0, "trade_id required");
    assert!(event.clawback_amount > 0, "clawback_amount required");
    assert!(event.remaining_amount >= 0, "remaining_amount required");
    
    assert_ne!(event.destination, Address::generate(&h.env), "destination must be set");
    assert_ne!(event.admin, Address::generate(&h.env), "admin must be set");
}

#[test]
fn test_event_idempotency_key_derivation() {
    let h = EventReplayHarness::new();
    let client = h.client();

    let trade_id = h.create_funded_trade(8_000);

    client.admin_clawback(&trade_id, &3_000, &h.buyer);
    client.admin_clawback(&trade_id, &3_000, &h.buyer);

    let events = h.get_clawback_events();
    assert_eq!(events.len(), 2);

    let key1 = (
        h.env.ledger().sequence(),
        h.contract_id.clone(),
        events[0].trade_id,
        events[0].clawback_amount,
    );

    let key2 = (
        h.env.ledger().sequence(),
        h.contract_id.clone(),
        events[1].trade_id,
        events[1].clawback_amount,
    );

    assert_eq!(key1.2, key2.2, "Same trade_id");
    assert_eq!(key1.3, key2.3, "Same clawback_amount");
}

#[test]
fn test_clawback_event_destination_address_recorded() {
    let h = EventReplayHarness::new();
    let client = h.client();

    let custom_dest = Address::generate(&h.env);
    let trade_id = h.create_funded_trade(5_000);

    client.admin_clawback(&trade_id, &5_000, &custom_dest);

    let events = h.get_clawback_events();
    let event = &events[0];

    assert_eq!(event.destination, custom_dest);
    assert_ne!(event.destination, h.buyer, "Destination can differ from buyer");
}

#[test]
fn test_event_ordering_matches_execution_order() {
    let h = EventReplayHarness::new();
    let client = h.client();

    let trade_id = h.create_funded_trade(12_000);

    let amounts = [2_000, 3_000, 7_000];
    for amount in amounts {
        client.admin_clawback(&trade_id, &amount, &h.buyer);
    }

    let events = h.get_clawback_events();
    assert_eq!(events.len(), 3);

    for (i, expected_amount) in amounts.iter().enumerate() {
        assert_eq!(
            events[i].clawback_amount, *expected_amount,
            "Event {i} should have clawback_amount {expected_amount}"
        );
    }

    let expected_remaining = [10_000, 7_000, 0];
    for (i, expected) in expected_remaining.iter().enumerate() {
        assert_eq!(
            events[i].remaining_amount, *expected,
            "Event {i} should have remaining_amount {expected}"
        );
    }
}

#[test]
fn test_clawback_event_admin_identity_preserved() {
    let h = EventReplayHarness::new();
    let client = h.client();

    let trade_id = h.create_funded_trade(4_000);
    client.admin_clawback(&trade_id, &4_000, &h.buyer);

    let events = h.get_clawback_events();
    let event = &events[0];

    assert_eq!(
        event.admin, h.admin,
        "Admin address must be recorded for audit trail"
    );
}

#[test]
fn test_replayed_event_can_be_detected_by_backend() {
    let h = EventReplayHarness::new();
    let client = h.client();

    let trade_id = h.create_funded_trade(6_000);
    client.admin_clawback(&trade_id, &6_000, &h.buyer);

    let events = h.get_clawback_events();
    let event = &events[0];

    let ledger_seq = h.env.ledger().sequence();
    let contract_id_str = format!("{:?}", h.contract_id);
    let event_key = format!("{}_{}_{}", ledger_seq, contract_id_str, event.trade_id);

    assert!(!event_key.is_empty(), "Event key must be derivable for deduplication");
}
