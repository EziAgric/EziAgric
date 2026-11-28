use soroban_sdk::{contracttype, Address, Env};

/// Status of a trade in its lifecycle.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
#[allow(dead_code)]
pub enum TradeStatus {
    Created = 0,
    Funded = 1,
    Completed = 2,
    Cancelled = 3,
    Disputed = 4,
}

/// A trade record stored on-chain.
///
/// # Storage layout / migration note
/// `created_at` (the ledger timestamp captured when the trade was created) was
/// added to this struct. Existing persisted `Trade` entries written before this
/// field existed must be migrated: re-serialize each stored trade with
/// `created_at` populated (use the trade's creation ledger timestamp if known,
/// otherwise `0`). Consumers reading `get_trade` should treat `created_at == 0`
/// as "unknown / pre-migration".
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Trade {
    pub id: u64,
    pub buyer: Address,
    pub seller: Address,
    pub amount: i128,
    pub loss_ratio: u32,
    pub deadline: u64,
    pub created_at: u64,
    pub status: TradeStatus,
}

/// Basis-point denominator used for `loss_ratio` validation.
pub const LOSS_RATIO_DENOMINATOR: u32 = 10_000;

/// Errors that can be returned when validating `create_trade` arguments.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum TradeError {
    /// `amount` must be strictly positive.
    InvalidAmount = 0,
    /// `loss_ratio` must be within `0..=LOSS_RATIO_DENOMINATOR`.
    InvalidLossRatio = 1,
    /// `deadline` must be strictly in the future relative to `now`.
    InvalidDeadline = 2,
    /// Buyer and seller must be distinct addresses.
    SameParty = 3,
}

/// Validate the numeric and address arguments accepted by `create_trade`.
///
/// This is the single source of truth for argument validation so that the
/// entrypoint and the fuzz/proptest suite exercise identical logic.
///
/// # Fuzzing
/// The proptest suite in `contracts/tests/create_trade_fuzz.rs` drives this
/// function with random `amount`, `loss_ratio`, `deadline`, and party
/// addresses. To run extended fuzzing locally:
///
/// ```text
/// PROPTEST_CASES=100000 cargo test -p contracts --test create_trade_fuzz
/// ```
///
/// A short (1-minute) run is executed on CI; the env var above increases the
/// number of generated cases for deeper local exploration.
pub fn validate_create_trade_args(
    buyer: &Address,
    seller: &Address,
    amount: i128,
    loss_ratio: u32,
    deadline: u64,
    now: u64,
) -> Result<(), TradeError> {
    if amount <= 0 {
        return Err(TradeError::InvalidAmount);
    }
    if loss_ratio > LOSS_RATIO_DENOMINATOR {
        return Err(TradeError::InvalidLossRatio);
    }
    if deadline <= now {
        return Err(TradeError::InvalidDeadline);
    }
    if buyer == seller {
        return Err(TradeError::SameParty);
    }
    Ok(())
}

/// Construct a validated `Trade` record.
///
/// Returns the same error variants as [`validate_create_trade_args`] for
/// invalid inputs and never panics on arbitrary numeric inputs. The trade's
/// `created_at` is set to the current ledger timestamp.
pub fn build_trade(
    env: &Env,
    id: u64,
    buyer: Address,
    seller: Address,
    amount: i128,
    loss_ratio: u32,
    deadline: u64,
) -> Result<Trade, TradeError> {
    let now = env.ledger().timestamp();
    validate_create_trade_args(&buyer, &seller, amount, loss_ratio, deadline, now)?;
    Ok(Trade {
        id,
        buyer,
        seller,
        amount,
        loss_ratio,
        deadline,
        created_at: now,
        status: TradeStatus::Created,
    })
}
