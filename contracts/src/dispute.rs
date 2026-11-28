use soroban_sdk::{contracttype, symbol_short, Address, Env, Symbol};

use crate::admin::get_config;
use crate::errors::ContractError;
use crate::events;
use crate::storage_types::DataKey;

/// Dispute record stored on-chain.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Dispute {
    pub trade_id: u64,
    pub buyer: Address,
    pub seller: Address,
    pub mediator: Address,
    pub opened_at: u64,
    pub resolved: bool,
}

/// Open a dispute for a trade. Callable by the buyer or seller.
pub fn open_dispute(
    env: &Env,
    trade_id: u64,
    buyer: Address,
    seller: Address,
    mediator: Address,
) -> Result<(), ContractError> {
    let key = DataKey::Dispute(trade_id);
    if env.storage().persistent().has(&key) {
        return Err(ContractError::DisputeAlreadyExists);
    }

    let dispute = Dispute {
        trade_id,
        buyer: buyer.clone(),
        seller: seller.clone(),
        mediator,
        opened_at: env.ledger().timestamp(),
        resolved: false,
    };

    env.storage().persistent().set(&key, &dispute);
    events::dispute_opened(env, trade_id, &buyer, &seller);
    Ok(())
}

/// Resolve a dispute in favour of the buyer or seller. Mediator only.
pub fn resolve_dispute(
    env: &Env,
    trade_id: u64,
    mediator: Address,
    buyer_wins: bool,
) -> Result<(), ContractError> {
    mediator.require_auth();

    let key = DataKey::Dispute(trade_id);
    let mut dispute: Dispute = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(ContractError::DisputeNotFound)?;

    if dispute.resolved {
        return Err(ContractError::DisputeAlreadyResolved);
    }
    if dispute.mediator != mediator {
        return Err(ContractError::Unauthorized);
    }

    dispute.resolved = true;
    env.storage().persistent().set(&key, &dispute);

    if buyer_wins {
        events::dispute_resolved_buyer(env, trade_id);
    } else {
        events::dispute_resolved_seller(env, trade_id);
    }
    Ok(())
}

/// Expire a dispute after the configured mediator timeout has elapsed.
/// Callable by either party (buyer or seller). Auto-resolves in the buyer's
/// favour and emits a `DisputeExpired` event.
pub fn expire_dispute(env: &Env, trade_id: u64, caller: Address) -> Result<(), ContractError> {
    caller.require_auth();

    let key = DataKey::Dispute(trade_id);
    let mut dispute: Dispute = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(ContractError::DisputeNotFound)?;

    if dispute.resolved {
        return Err(ContractError::DisputeAlreadyResolved);
    }
    if caller != dispute.buyer && caller != dispute.seller {
        return Err(ContractError::Unauthorized);
    }

    let config = get_config(env);
    let timeout_secs = (config.mediator_timeout_hours as u64) * 60 * 60;
    let expires_at = dispute.opened_at.saturating_add(timeout_secs);

    if env.ledger().timestamp() < expires_at {
        return Err(ContractError::DisputeNotExpired);
    }

    dispute.resolved = true;
    env.storage().persistent().set(&key, &dispute);

    events::dispute_expired(env, trade_id, &dispute.buyer);
    Ok(())
}

/// Read a dispute record.
pub fn get_dispute(env: &Env, trade_id: u64) -> Result<Dispute, ContractError> {
    env.storage()
        .persistent()
        .get(&DataKey::Dispute(trade_id))
        .ok_or(ContractError::DisputeNotFound)
}

#[allow(dead_code)]
fn _dispute_symbol() -> Symbol {
    symbol_short!("dispute")
}
