//! Issue #97 — Contract error codes for admin clawback failures.
//!
//! Verifies that `admin_clawback()` panics with the expected structured error
//! code strings for each invalid-input scenario, and that a valid clawback
//! succeeds with the correct token transfer.

extern crate std;

use amana_escrow::{EscrowContract, EscrowContractClient, TradeStatus};
use soroban_sdk::{Address, Env, testutils::Address as _, token};

// ---------------------------------------------------------------------------
// Shared harness
// ---------------------------------------------------------------------------

struct Harness {
    env: Env,
    contract_id: Address,
    token_id: Address,
    admin: Address,
    buyer: Address,
    seller: Address,
    treasury: Address,
    stranger: Address,
}

impl Harness {
    fn new() -> Self {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let treasury = Address::generate(&env);
        let stranger = Address::generate(&env);
        let token_id = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let contract_id = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin, &token_id, &treasury, &100u32, &token_id);

        Self {
            env,
            contract_id,
            token_id,
            admin,
            buyer,
            seller,
            treasury,
            stranger,
        }
    }

    fn client(&self) -> EscrowContractClient<'_> {
        EscrowContractClient::new(&self.env, &self.contract_id)
    }

    fn mint(&self, to: &Address, amount: i128) {
        token::StellarAssetClient::new(&self.env, &self.token_id).mint(to, &amount);
    }

    /// Create a funded trade of the given amount and return its trade_id.
    fn funded_trade(&self, amount: i128) -> u64 {
        self.mint(&self.buyer, amount);
        let tid = self.client().create_trade(
            &self.buyer,
            &self.seller,
            &amount,
            &5000u32,
            &5000u32,
            &None,
        );
        self.client().deposit(&tid);
        tid
    }
}

// ---------------------------------------------------------------------------
// Error code tests
// ---------------------------------------------------------------------------

/// Non-admin caller triggers CLAWBACK_UNAUTHORIZED.
#[test]
#[should_panic(expected = "CLAWBACK_UNAUTHORIZED")]
fn test_clawback_unauthorized_caller() {
    let h = Harness::new();
    let tid = h.funded_trade(1_000);
    // `stranger` is not the admin — must panic with CLAWBACK_UNAUTHORIZED
    h.client().admin_clawback(&tid, &500i128, &h.stranger);
}

/// Amount of zero triggers CLAWBACK_INVALID_AMOUNT.
#[test]
#[should_panic(expected = "CLAWBACK_INVALID_AMOUNT")]
fn test_clawback_invalid_amount_zero() {
    let h = Harness::new();
    let tid = h.funded_trade(1_000);
    h.client().admin_clawback(&tid, &0i128, &h.admin);
}

/// Negative amount triggers CLAWBACK_INVALID_AMOUNT.
#[test]
#[should_panic(expected = "CLAWBACK_INVALID_AMOUNT")]
fn test_clawback_invalid_amount_negative() {
    let h = Harness::new();
    let tid = h.funded_trade(1_000);
    h.client().admin_clawback(&tid, &(-1i128), &h.admin);
}

/// Non-existent trade triggers CLAWBACK_STREAM_NOT_FOUND.
#[test]
#[should_panic(expected = "CLAWBACK_STREAM_NOT_FOUND")]
fn test_clawback_stream_not_found() {
    let h = Harness::new();
    // Use a trade_id that was never created
    h.client().admin_clawback(&9999u64, &100i128, &h.admin);
}

/// Amount exceeding the escrowed balance triggers CLAWBACK_INSUFFICIENT_VESTED.
#[test]
#[should_panic(expected = "CLAWBACK_INSUFFICIENT_VESTED")]
fn test_clawback_insufficient_vested() {
    let h = Harness::new();
    let amount = 1_000i128;
    let tid = h.funded_trade(amount);
    // Request more than was escrowed
    h.client().admin_clawback(&tid, &(amount + 1), &h.admin);
}

/// Clawback on a non-Funded (Created) trade triggers CLAWBACK_INVALID_STATUS.
#[test]
#[should_panic(expected = "CLAWBACK_INVALID_STATUS")]
fn test_clawback_invalid_status_created() {
    let h = Harness::new();
    // Create a trade but do NOT fund it — status is Created
    let tid = h.client().create_trade(
        &h.buyer,
        &h.seller,
        &500i128,
        &5000u32,
        &5000u32,
        &None,
    );
    h.client().admin_clawback(&tid, &500i128, &h.admin);
}

/// Clawback on a Completed trade triggers CLAWBACK_INVALID_STATUS.
#[test]
#[should_panic(expected = "CLAWBACK_INVALID_STATUS")]
fn test_clawback_invalid_status_completed() {
    let h = Harness::new();
    let amount = 1_000i128;
    let tid = h.funded_trade(amount);
    // Confirm delivery and release → Completed
    h.client().confirm_delivery(&tid);
    h.client().release_funds(&tid, &h.buyer);
    // Now status is Completed — clawback must fail
    h.client().admin_clawback(&tid, &amount, &h.admin);
}

// ---------------------------------------------------------------------------
// Happy-path tests
// ---------------------------------------------------------------------------

/// Valid admin clawback of the full amount succeeds.
///
/// Verifies:
/// - buyer receives the full escrowed amount
/// - trade status transitions to Cancelled
/// - contract balance goes to zero
#[test]
fn test_clawback_full_amount_succeeds() {
    let h = Harness::new();
    let amount = 2_000i128;
    let tid = h.funded_trade(amount);

    let tok = token::Client::new(&h.env, &h.token_id);

    // Buyer spent `amount` on deposit; balance should be 0 before clawback
    assert_eq!(tok.balance(&h.buyer), 0);
    assert_eq!(tok.balance(&h.client().address), amount);

    h.client().admin_clawback(&tid, &amount, &h.admin);

    // After clawback buyer has funds back
    assert_eq!(tok.balance(&h.buyer), amount);
    assert_eq!(tok.balance(&h.client().address), 0);

    // Trade is now Cancelled
    let trade = h.client().get_trade(&tid);
    assert!(matches!(trade.status, TradeStatus::Cancelled));
}

/// Valid admin clawback of a partial amount succeeds.
///
/// Verifies that the admin can clawback less than the full escrowed amount.
#[test]
fn test_clawback_partial_amount_succeeds() {
    let h = Harness::new();
    let amount = 2_000i128;
    let partial = 1_000i128;
    let tid = h.funded_trade(amount);

    let tok = token::Client::new(&h.env, &h.token_id);

    h.client().admin_clawback(&tid, &partial, &h.admin);

    // Buyer received partial refund
    assert_eq!(tok.balance(&h.buyer), partial);
    // Trade is Cancelled
    let trade = h.client().get_trade(&tid);
    assert!(matches!(trade.status, TradeStatus::Cancelled));
}
