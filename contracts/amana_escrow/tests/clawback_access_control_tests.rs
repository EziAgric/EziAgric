/// Issue #92 — Soroban contract access control tests for `admin_clawback`.
///
/// Every test here asserts the caller role is enforced before any state
/// mutation occurs.  The contract-level auth is exercised in two ways:
///
///   1. `mock_all_auths()` — used for the "happy-path" (admin succeeds) tests
///      to let the test focus on state assertions.
///   2. `mock_auths(…)` with a non-admin signer — used for "deny" tests to
///      confirm that supplying auth for the wrong address is rejected.
///
/// # Documentation
/// `admin_clawback` is guarded by two layers:
///   - `admin.require_auth()` — the Soroban auth engine rejects any invocation
///     that is not accompanied by a valid authorization signature from `admin`.
///   - An address comparison against the immutably stored admin — even if a
///     caller somehow passes the auth engine, the assert fires if the supplied
///     address differs from the stored one.
///
/// # Failure messages checked
/// Each deny test uses `#[should_panic(expected = "…")]` with the exact string
/// that the contract emits, making test failures unambiguous.
extern crate std;

use amana_escrow::{EscrowContract, EscrowContractClient, TradeStatus};
use soroban_sdk::{Address, Env, testutils::Address as _, token};

// ---------------------------------------------------------------------------
// Shared harness
// ---------------------------------------------------------------------------

struct Harness {
    env: Env,
    contract_id: Address,
    usdc_id: Address,
    /// The contract admin — the only address authorised to call `admin_clawback`.
    admin: Address,
    buyer: Address,
    seller: Address,
    mediator: Address,
    treasury: Address,
    /// An address with no special role.
    stranger: Address,
}

impl Harness {
    fn new() -> Self {
        let env = Env::default();
        env.mock_all_auths();

        let admin = Address::generate(&env);
        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);
        let mediator = Address::generate(&env);
        let treasury = Address::generate(&env);
        let stranger = Address::generate(&env);

        let usdc_id = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let contract_id = env.register(EscrowContract, ());

        let client = EscrowContractClient::new(&env, &contract_id);
        client.initialize(&admin, &usdc_id, &treasury, &100u32, &usdc_id);
        client.add_mediator(&mediator);

        Harness {
            env,
            contract_id,
            usdc_id,
            admin,
            buyer,
            seller,
            mediator,
            treasury,
            stranger,
        }
    }

    fn client(&self) -> EscrowContractClient<'_> {
        EscrowContractClient::new(&self.env, &self.contract_id)
    }

    /// Mint `amount` tokens to `to` using the stellar asset client.
    fn mint(&self, to: &Address, amount: i128) {
        token::StellarAssetClient::new(&self.env, &self.usdc_id).mint(to, &amount);
    }

    /// Create a trade and deposit funds so it is in `Funded` status.
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
// Helper: build a `MockAuth` for a single caller + function + trade_id arg
// ---------------------------------------------------------------------------

fn single_auth<'a>(
    env: &'a Env,
    contract_id: &'a Address,
    caller: &'a Address,
    fn_name: &'static str,
    trade_id: u64,
) -> soroban_sdk::testutils::MockAuth<'a> {
    soroban_sdk::testutils::MockAuth {
        address: caller,
        invoke: &soroban_sdk::testutils::MockAuthInvoke {
            contract: contract_id,
            fn_name,
            args: soroban_sdk::vec![
                env,
                soroban_sdk::IntoVal::<Env, soroban_sdk::Val>::into_val(caller, env),
                soroban_sdk::IntoVal::<Env, soroban_sdk::Val>::into_val(&trade_id, env),
            ],
            sub_invokes: &[],
        },
    }
}

// ===========================================================================
// ACCESS CONTROL TESTS  (#92)
// ===========================================================================

// ---------------------------------------------------------------------------
// Admin succeeds
// ---------------------------------------------------------------------------

/// The admin may call `admin_clawback` on any funded trade.
/// After the call the trade must be `Cancelled` and the buyer must have
/// received the full escrowed amount.
#[test]
fn test_clawback_admin_succeeds_and_trade_is_cancelled() {
    let h = Harness::new();
    let amount = 1_000i128;
    let tid = h.funded_trade(amount);

    let token = token::Client::new(&h.env, &h.usdc_id);

    // Admin performs the clawback
    h.client().admin_clawback(&h.admin, &tid);

    // Trade must be Cancelled
    assert!(
        matches!(h.client().get_trade(&tid).status, TradeStatus::Cancelled),
        "admin_clawback: trade should be Cancelled after clawback"
    );

    // Full escrow returned to buyer — contract holds nothing
    assert_eq!(
        token.balance(&h.buyer),
        amount,
        "admin_clawback: buyer must receive the full escrowed amount"
    );
    assert_eq!(
        token.balance(&h.client().address),
        0,
        "admin_clawback: contract balance must be zero after clawback"
    );
}

/// Admin may execute clawback on multiple distinct funded trades.
#[test]
fn test_clawback_admin_can_clawback_multiple_trades() {
    let h = Harness::new();
    let amount = 500i128;
    let tid1 = h.funded_trade(amount);
    let tid2 = h.funded_trade(amount);

    h.client().admin_clawback(&h.admin, &tid1);
    h.client().admin_clawback(&h.admin, &tid2);

    assert!(matches!(
        h.client().get_trade(&tid1).status,
        TradeStatus::Cancelled
    ));
    assert!(matches!(
        h.client().get_trade(&tid2).status,
        TradeStatus::Cancelled
    ));
}

// ---------------------------------------------------------------------------
// Stranger is denied
// ---------------------------------------------------------------------------

/// A stranger (no role) supplying their own auth must be rejected.
/// The contract panics with `"admin_clawback: caller is not the admin"`.
#[test]
#[should_panic(expected = "admin_clawback: caller is not the admin")]
fn test_clawback_stranger_denied() {
    let h = Harness::new();
    let tid = h.funded_trade(1_000);

    h.client()
        .mock_auths(&[single_auth(
            &h.env,
            &h.contract_id,
            &h.stranger,
            "admin_clawback",
            tid,
        )])
        .admin_clawback(&h.stranger, &tid);
}

// ---------------------------------------------------------------------------
// Buyer is denied
// ---------------------------------------------------------------------------

/// The buyer cannot use `admin_clawback` even though they are a party to the
/// trade.  The function is strictly admin-only.
#[test]
#[should_panic(expected = "admin_clawback: caller is not the admin")]
fn test_clawback_buyer_denied() {
    let h = Harness::new();
    let tid = h.funded_trade(1_000);

    h.client()
        .mock_auths(&[single_auth(
            &h.env,
            &h.contract_id,
            &h.buyer,
            "admin_clawback",
            tid,
        )])
        .admin_clawback(&h.buyer, &tid);
}

// ---------------------------------------------------------------------------
// Seller is denied
// ---------------------------------------------------------------------------

/// The seller cannot use `admin_clawback` for their own benefit.
#[test]
#[should_panic(expected = "admin_clawback: caller is not the admin")]
fn test_clawback_seller_denied() {
    let h = Harness::new();
    let tid = h.funded_trade(1_000);

    h.client()
        .mock_auths(&[single_auth(
            &h.env,
            &h.contract_id,
            &h.seller,
            "admin_clawback",
            tid,
        )])
        .admin_clawback(&h.seller, &tid);
}

// ---------------------------------------------------------------------------
// Mediator is denied
// ---------------------------------------------------------------------------

/// A registered mediator does not inherit admin capabilities.
#[test]
#[should_panic(expected = "admin_clawback: caller is not the admin")]
fn test_clawback_mediator_denied() {
    let h = Harness::new();
    let tid = h.funded_trade(1_000);

    h.client()
        .mock_auths(&[single_auth(
            &h.env,
            &h.contract_id,
            &h.mediator,
            "admin_clawback",
            tid,
        )])
        .admin_clawback(&h.mediator, &tid);
}

// ---------------------------------------------------------------------------
// Treasury is denied
// ---------------------------------------------------------------------------

/// The treasury address (fee recipient) is not the admin.
#[test]
#[should_panic(expected = "admin_clawback: caller is not the admin")]
fn test_clawback_treasury_denied() {
    let h = Harness::new();
    let tid = h.funded_trade(1_000);

    h.client()
        .mock_auths(&[single_auth(
            &h.env,
            &h.contract_id,
            &h.treasury,
            "admin_clawback",
            tid,
        )])
        .admin_clawback(&h.treasury, &tid);
}

// ---------------------------------------------------------------------------
// Status gate — wrong trade state
// ---------------------------------------------------------------------------

/// `admin_clawback` must be rejected on a `Created` (unfunded) trade.
#[test]
#[should_panic(expected = "admin_clawback: trade must be in Funded status")]
fn test_clawback_rejects_created_trade() {
    let h = Harness::new();
    let tid = h.client().create_trade(
        &h.buyer,
        &h.seller,
        &1_000i128,
        &5000u32,
        &5000u32,
        &None,
    );
    // No deposit — trade is still Created
    h.client().admin_clawback(&h.admin, &tid);
}

/// `admin_clawback` must be rejected once the buyer has confirmed delivery
/// (trade is `Delivered`).
#[test]
#[should_panic(expected = "admin_clawback: trade must be in Funded status")]
fn test_clawback_rejects_delivered_trade() {
    let h = Harness::new();
    let tid = h.funded_trade(1_000);
    h.client().confirm_delivery(&tid);
    // Trade is now Delivered, not Funded
    h.client().admin_clawback(&h.admin, &tid);
}

/// `admin_clawback` must be rejected on a `Cancelled` trade.
#[test]
#[should_panic(expected = "admin_clawback: trade must be in Funded status")]
fn test_clawback_rejects_cancelled_trade() {
    let h = Harness::new();
    let tid = h.funded_trade(1_000);
    // Admin cancels via the normal path first
    h.client().cancel_trade(&tid, &h.admin);
    // Now try admin_clawback — must be rejected
    h.client().admin_clawback(&h.admin, &tid);
}

/// `admin_clawback` must be rejected on a `Disputed` trade.
#[test]
#[should_panic(expected = "admin_clawback: trade must be in Funded status")]
fn test_clawback_rejects_disputed_trade() {
    let h = Harness::new();
    let tid = h.funded_trade(1_000);
    h.client().initiate_dispute(
        &tid,
        &h.buyer,
        &soroban_sdk::String::from_str(&h.env, "QmClawbackDisputeTest"),
    );
    // Trade is now Disputed, not Funded
    h.client().admin_clawback(&h.admin, &tid);
}

/// `admin_clawback` must be rejected on a `Completed` trade.
#[test]
#[should_panic(expected = "admin_clawback: trade must be in Funded status")]
fn test_clawback_rejects_completed_trade() {
    let h = Harness::new();
    let tid = h.funded_trade(1_000);
    h.client().confirm_delivery(&tid);
    h.client().release_funds(&tid, &h.admin);
    // Trade is now Completed
    h.client().admin_clawback(&h.admin, &tid);
}
