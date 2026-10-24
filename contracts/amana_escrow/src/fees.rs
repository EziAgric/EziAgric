//! Platform fee configuration, accrual and the shared basis-point math.

use soroban_sdk::{Address, Env, contractimpl, token};

use crate::*;

pub(crate) const BPS_DIVISOR: i128 = 10_000;

pub(crate) fn checked_fee_amount(amount: i128, fee_bps: u32) -> i128 {
    amount
        .checked_mul(fee_bps as i128)
        .expect("fee calculation overflow")
        / BPS_DIVISOR
}

pub(crate) fn checked_loss_amount(total: i128, loss_bps: i128, seller_loss_bps: u32) -> i128 {
    total
        .checked_mul(loss_bps)
        .expect("loss calculation overflow")
        .checked_mul(seller_loss_bps as i128)
        .expect("loss sharing calculation overflow")
        / (BPS_DIVISOR * BPS_DIVISOR)
}

#[contractimpl]
impl EscrowContract {
    /// Update the platform fee rate. Admin only.
    /// `new_fee_bps` must be within [`MIN_FEE_BPS`, `MAX_FEE_BPS`].
    /// Emits `FeeRateUpdated(old, new)`.
    pub fn update_fee_bps(env: Env, new_fee_bps: u32) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        admin.require_auth();
        assert!(
            (MIN_FEE_BPS..=MAX_FEE_BPS).contains(&new_fee_bps),
            "fee_bps out of range"
        );
        let old_fee_bps: u32 = env.storage().instance().get(&DataKey::FeeBps).unwrap_or(0);
        env.storage().instance().set(&DataKey::FeeBps, &new_fee_bps);
        FeeRateUpdatedEvent {
            old_fee_bps,
            new_fee_bps,
        }
        .publish(&env);
    }

    /// Withdraw accrued platform fees from the contract to `destination`.
    /// Only the admin may call this. Reverts if `amount` is zero or exceeds
    /// the currently accrued fees. Emits `FeesWithdrawn`.
    pub fn withdraw_fees(env: Env, amount: i128, destination: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        admin.require_auth();
        assert!(amount > 0, "amount must be greater than zero");
        let accrued_fees: i128 = env
            .storage()
            .instance()
            .get(&DataKey::AccruedFees)
            .unwrap_or(0);
        assert!(amount <= accrued_fees, "insufficient accrued fees");
        let token: Address = env
            .storage()
            .instance()
            .get(&DataKey::CngnContract)
            .expect("Not initialized");
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&env.current_contract_address(), &destination, &amount);
        env.storage()
            .instance()
            .set(&DataKey::AccruedFees, &(accrued_fees - amount));
        FeesWithdrawnEvent {
            amount,
            destination,
        }
        .publish(&env);
        Self::bump_instance_ttl(&env);
    }

    /// Return the total accrued platform fees that remain unwithdrawn.
    pub fn get_accrued_fees(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::AccruedFees)
            .unwrap_or(0)
    }

    /// Return the current platform fee in basis points.
    pub fn get_fee_bps(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::FeeBps).unwrap_or(0)
    }
}

/// Pro-rata split for a partial delivery (#349).
///
/// Returns `(delivered, undelivered, seller_amount, buyer_refund, fee)` where:
///   delivered     = total * delivered_bps / 10_000
///   undelivered   = total - delivered
///   buyer_refund  = undelivered * seller_loss_bps / 10_000   (seller's share of the shortfall)
///   fee           = delivered * fee_bps / 10_000             (delivered portion only)
///   seller_amount = total - buyer_refund - fee
///
/// Every remainder is assigned by subtraction, so
/// `seller_amount + buyer_refund + fee == total` holds exactly (no dust).
pub(crate) fn partial_delivery_split(
    total: i128,
    delivered_bps: u32,
    seller_loss_bps: u32,
    fee_bps: u32,
) -> (i128, i128, i128, i128, i128) {
    let delivered = total
        .checked_mul(delivered_bps as i128)
        .expect("delivered amount overflow")
        / BPS_DIVISOR;
    let undelivered = total - delivered;
    let buyer_refund = undelivered
        .checked_mul(seller_loss_bps as i128)
        .expect("undelivered loss overflow")
        / BPS_DIVISOR;
    let fee = checked_fee_amount(delivered, fee_bps);
    let seller_amount = total - buyer_refund - fee;
    (delivered, undelivered, seller_amount, buyer_refund, fee)
}
