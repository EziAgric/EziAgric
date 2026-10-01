#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, token, Address, Env, Vec};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/// Deterministic xorshift64* PRNG so sequences are reproducible from a seed.
struct Rng(u64);

impl Rng {
    fn new(seed: u64) -> Self {
        // Avoid the all-zero state which would make xorshift degenerate.
        Rng(if seed == 0 { 0x9E37_79B9_7F4A_7C15 } else { seed })
    }

    fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.0 = x;
        x.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }

    /// Uniform value in `[0, bound)`.
    fn below(&mut self, bound: u64) -> u64 {
        if bound == 0 {
            0
        } else {
            self.next_u64() % bound
        }
    }
}

struct Harness<'a> {
    env: Env,
    client: AmanaEscrowClient<'a>,
    admin: Address,
    token: token::Client<'a>,
    token_admin: token::StellarAssetClient<'a>,
    contract_id: Address,
}

fn setup<'a>() -> Harness<'a> {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let contract_id = env.register(AmanaEscrow, ());
    let client = AmanaEscrowClient::new(&env, &contract_id);

    let token_admin_addr = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(token_admin_addr.clone());
    let token_id = sac.address();
    let token = token::Client::new(&env, &token_id);
    let token_admin = token::StellarAssetClient::new(&env, &token_id);

    client.initialize(&admin, &token_id);

    Harness {
        env,
        client,
        admin,
        token,
        token_admin,
        contract_id,
    }
}

impl<'a> Harness<'a> {
    /// Sum of balances still held by the contract for open (non-terminal) trades.
    fn open_escrow_sum(&self) -> i128 {
        let mut sum: i128 = 0;
        for id in 0..self.client.trade_count() {
            if let Some(trade) = self.client.get_trade(&id) {
                if !trade.settled && !trade.cancelled {
                    sum += trade.amount;
                }
            }
        }
        sum
    }

    /// Accrued fees tracked by the contract.
    fn accrued_fees(&self) -> i128 {
        self.client.accrued_fees()
    }

    /// Core invariant: contract token balance == open escrow + accrued fees.
    fn assert_conservation(&self, seed: u64, step: usize) {
        let balance = self.token.balance(&self.contract_id);
        let expected = self.open_escrow_sum() + self.accrued_fees();
        assert_eq!(
            balance, expected,
            "balance conservation violated (seed={}, step={}): balance={}, open_escrow+fees={}",
            seed, step, balance, expected
        );
    }
}

// ---------------------------------------------------------------------------
// Property test: balance conservation across randomized lifecycle paths
// ---------------------------------------------------------------------------

/// Drives a randomized sequence of lifecycle operations and asserts after every
/// step that the contract's token balance equals the sum of open escrow
/// balances plus accrued fees. Runs a fixed seed plus a random seed, each with
/// >= 1,000 sequences. The seed is printed on failure for reproduction.
#[test]
fn test_balance_conservation_property() {
    // Fixed seed for deterministic CI, plus a time-derived random seed.
    let fixed_seed: u64 = 0x5EED_1234_ABCD_0001;
    let random_seed: u64 = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0xDEAD_BEEF);

    for seed in [fixed_seed, random_seed] {
        run_sequences(seed);
    }
}

fn run_sequences(seed: u64) {
    const SEQUENCES: usize = 1_000;
    const MAX_STEPS: usize = 12;

    for seq in 0..SEQUENCES {
        let mut rng = Rng::new(seed ^ (seq as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15));
        let h = setup();

        // Fund the buyer pool so create/fund operations can move tokens.
        let buyer = Address::generate(&h.env);
        h.token_admin.mint(&buyer, &1_000_000_000);

        let mut trade_ids: Vec<u64> = Vec::new(&h.env);

        for step in 0..MAX_STEPS {
            let action = rng.below(7);
            match action {
                0 => {
                    // create
                    let amount = (rng.below(1_000) + 1) as i128;
                    let seller = Address::generate(&h.env);
                    let id = h.client.create_trade(&buyer, &seller, &amount);
                    trade_ids.push_back(id);
                }
                1 => {
                    // fund
                    if let Some(id) = pick(&h.env, &mut rng, &trade_ids) {
                        let _ = h.client.try_fund_trade(&id, &buyer);
                    }
                }
                2 => {
                    // confirm
                    if let Some(id) = pick(&h.env, &mut rng, &trade_ids) {
                        let _ = h.client.try_confirm_delivery(&id, &buyer);
                    }
                }
                3 => {
                    // dispute
                    if let Some(id) = pick(&h.env, &mut rng, &trade_ids) {
                        let _ = h.client.try_raise_dispute(&id, &buyer);
                    }
                }
                4 => {
                    // resolve
                    if let Some(id) = pick(&h.env, &mut rng, &trade_ids) {
                        let _ = h.client.try_resolve_dispute(&id, &h.admin);
                    }
                }
                5 => {
                    // refund
                    if let Some(id) = pick(&h.env, &mut rng, &trade_ids) {
                        let _ = h.client.try_refund(&id, &h.admin);
                    }
                }
                _ => {
                    // cancel
                    if let Some(id) = pick(&h.env, &mut rng, &trade_ids) {
                        let _ = h.client.try_cancel_trade(&id, &buyer);
                    }
                }
            }

            h.assert_conservation(seed, step);
        }
    }
}

/// Pick a random trade id from the tracked set, if any exist.
fn pick(env: &Env, rng: &mut Rng, ids: &Vec<u64>) -> Option<u64> {
    if ids.is_empty() {
        None
    } else {
        Some(ids.get(rng.below(ids.len() as u64) as u32).unwrap())
    }
}
