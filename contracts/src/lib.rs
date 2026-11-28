//! # Contract Entrypoints
//!
//! This module exposes the public contract interface for the platform.
//! It wires together the fee, admin, and settlement modules.

use soroban_sdk::{contract, contractimpl, Address, Env};

use crate::admin;
use crate::fees;

#[contract]
pub struct Contract;

#[contractimpl]
impl Contract {
    /// Configure the platform fee recipient for a specific token.
    ///
    /// Only the admin may call this. When no per-token recipient is set,
    /// settlement falls back to the global fee address.
    pub fn set_fee_address(env: Env, token: Address, recipient: Address, admin: Address) {
        admin::require_admin(&env, &admin);
        fees::set_fee_address(&env, &token, &recipient);
    }

    /// Read the platform fee recipient configured for a specific token.
    ///
    /// Returns the per-token recipient when configured, otherwise the
    /// global fee address fallback.
    pub fn get_fee_address(env: Env, token: Address) -> Address {
        fees::get_fee_address(&env, &token)
    }
}
