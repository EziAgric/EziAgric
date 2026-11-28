//! Admin management functions for the escrow contract.
//!
//! This module contains privileged operations that can only be invoked by the
//! contract administrator, such as pausing the contract, updating fees, and
//! managing the approved mediator registry.

use soroban_sdk::{Address, Env, Vec};

use crate::storage::{self, DataKey};
use crate::Error;

/// Returns the current administrator address.
pub fn get_admin(env: &Env) -> Address {
    storage::get_admin(env)
}

/// Transfers contract administration to `new_admin`.
pub fn set_admin(env: &Env, current_admin: &Address, new_admin: &Address) -> Result<(), Error> {
    current_admin.require_auth();
    let stored = storage::get_admin(env);
    if &stored != current_admin {
        return Err(Error::Unauthorized);
    }
    storage::set_admin(env, new_admin);
    Ok(())
}

/// Pauses the contract, blocking state-changing operations.
pub fn pause(env: &Env, admin: &Address) -> Result<(), Error> {
    admin.require_auth();
    let stored = storage::get_admin(env);
    if &stored != admin {
        return Err(Error::Unauthorized);
    }
    env.storage().instance().set(&DataKey::Paused, &true);
    Ok(())
}

/// Resumes the contract after a pause.
pub fn unpause(env: &Env, admin: &Address) -> Result<(), Error> {
    admin.require_auth();
    let stored = storage::get_admin(env);
    if &stored != admin {
        return Err(Error::Unauthorized);
    }
    env.storage().instance().set(&DataKey::Paused, &false);
    Ok(())
}

/// Returns whether the contract is currently paused.
pub fn is_paused(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::Paused)
        .unwrap_or(false)
}

/// Registers `mediator` in the approved mediator registry.
///
/// Only the contract administrator may call this. Registering an address that
/// is already approved is a no-op.
pub fn add_mediator(env: &Env, admin: &Address, mediator: &Address) -> Result<(), Error> {
    admin.require_auth();
    let stored = storage::get_admin(env);
    if &stored != admin {
        return Err(Error::Unauthorized);
    }

    let mut mediators: Vec<Address> = env
        .storage()
        .persistent()
        .get(&DataKey::Mediators)
        .unwrap_or_else(|| Vec::new(env));

    if !mediators.contains(mediator) {
        mediators.push_back(mediator.clone());
        env.storage()
            .persistent()
            .set(&DataKey::Mediators, &mediators);
    }

    Ok(())
}

/// Deregisters `mediator` from the approved mediator registry.
///
/// Only the contract administrator may call this. Removing an address that is
/// not registered is a no-op.
pub fn remove_mediator(env: &Env, admin: &Address, mediator: &Address) -> Result<(), Error> {
    admin.require_auth();
    let stored = storage::get_admin(env);
    if &stored != admin {
        return Err(Error::Unauthorized);
    }

    let mediators: Vec<Address> = env
        .storage()
        .persistent()
        .get(&DataKey::Mediators)
        .unwrap_or_else(|| Vec::new(env));

    let mut updated: Vec<Address> = Vec::new(env);
    for entry in mediators.iter() {
        if &entry != mediator {
            updated.push_back(entry);
        }
    }

    env.storage()
        .persistent()
        .set(&DataKey::Mediators, &updated);

    Ok(())
}

/// Returns whether `mediator` is present in the approved mediator registry.
pub fn is_mediator(env: &Env, mediator: &Address) -> bool {
    let mediators: Vec<Address> = env
        .storage()
        .persistent()
        .get(&DataKey::Mediators)
        .unwrap_or_else(|| Vec::new(env));
    mediators.contains(mediator)
}
