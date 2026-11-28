use soroban_sdk::{contracttype, Address, Env, Map};

use crate::admin;
use crate::errors::ContractError;

/// Storage keys for the fee module.
#[contracttype]
#[derive(Clone)]
pub enum FeeKey {
    /// Global fallback fee recipient address.
    FeeAddress,
    /// Per-token fee recipient overrides: token -> recipient.
    TokenFeeAddress(Address),
}

/// Returns the global fallback fee recipient address, if configured.
pub fn get_global_fee_address(env: &Env) -> Option<Address> {
    env.storage().instance().get(&FeeKey::FeeAddress)
}

/// Sets the global fallback fee recipient address.
pub fn set_global_fee_address(env: &Env, recipient: Address) {
    env.storage()
        .instance()
        .set(&FeeKey::FeeAddress, &recipient);
}

/// Returns the fee recipient configured for a specific token, if any.
pub fn get_token_fee_address(env: &Env, token: &Address) -> Option<Address> {
    env.storage()
        .instance()
        .get(&FeeKey::TokenFeeAddress(token.clone()))
}

/// Sets the fee recipient for a specific token.
///
/// Requires `admin` authorization and that `admin` matches the stored admin.
pub fn set_fee_address(
    env: &Env,
    token: Address,
    recipient: Address,
    admin: Address,
) -> Result<(), ContractError> {
    admin::require_admin(env, &admin)?;
    env.storage()
        .instance()
        .set(&FeeKey::TokenFeeAddress(token), &recipient);
    Ok(())
}

/// Read-only entrypoint: returns the fee recipient for `token`.
///
/// Falls back to the global fee address when no per-token address is set.
/// Panics if neither is configured.
pub fn get_fee_address(env: &Env, token: Address) -> Address {
    get_token_fee_address(env, &token)
        .or_else(|| get_global_fee_address(env))
        .expect("fee address not configured")
}

/// Resolves the fee recipient to use when settling fees for `token`.
///
/// Prefers the per-token address, falling back to the global address.
pub fn resolve_fee_address(env: &Env, token: &Address) -> Result<Address, ContractError> {
    get_token_fee_address(env, token)
        .or_else(|| get_global_fee_address(env))
        .ok_or(ContractError::FeeAddressNotSet)
}

/// Settles fees for `token` by routing `amount` to the resolved fee recipient.
///
/// Uses the per-token fee address when configured, otherwise the global
/// fallback address.
pub fn settle_fee(
    env: &Env,
    token: &Address,
    payer: &Address,
    amount: i128,
) -> Result<(), ContractError> {
    let recipient = resolve_fee_address(env, token)?;
    let client = soroban_sdk::token::Client::new(env, token);
    client.transfer(payer, &recipient, &amount);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Env;

    fn setup() -> (Env, Address) {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        admin::set_admin(&env, &admin);
        (env, admin)
    }

    #[test]
    fn single_token_configuration() {
        let (env, admin) = setup();
        let token = Address::generate(&env);
        let recipient = Address::generate(&env);

        set_fee_address(&env, token.clone(), recipient.clone(), admin).unwrap();

        assert_eq!(get_fee_address(&env, token.clone()), recipient);
        assert_eq!(resolve_fee_address(&env, &token).unwrap(), recipient);
    }

    #[test]
    fn multi_token_configuration() {
        let (env, admin) = setup();
        let cngn = Address::generate(&env);
        let cusdc = Address::generate(&env);
        let cngn_recipient = Address::generate(&env);
        let cusdc_recipient = Address::generate(&env);

        set_fee_address(&env, cngn.clone(), cngn_recipient.clone(), admin.clone()).unwrap();
        set_fee_address(&env, cusdc.clone(), cusdc_recipient.clone(), admin).unwrap();

        assert_eq!(get_fee_address(&env, cngn.clone()), cngn_recipient);
        assert_eq!(get_fee_address(&env, cusdc.clone()), cusdc_recipient);
        assert_eq!(resolve_fee_address(&env, &cngn).unwrap(), cngn_recipient);
        assert_eq!(resolve_fee_address(&env, &cusdc).unwrap(), cusdc_recipient);
    }

    #[test]
    fn falls_back_to_global_address() {
        let (env, _admin) = setup();
        let token = Address::generate(&env);
        let global = Address::generate(&env);

        set_global_fee_address(&env, global.clone());

        assert_eq!(get_fee_address(&env, token.clone()), global);
        assert_eq!(resolve_fee_address(&env, &token).unwrap(), global);
    }

    #[test]
    fn per_token_overrides_global() {
        let (env, admin) = setup();
        let token = Address::generate(&env);
        let global = Address::generate(&env);
        let per_token = Address::generate(&env);

        set_global_fee_address(&env, global);
        set_fee_address(&env, token.clone(), per_token.clone(), admin).unwrap();

        assert_eq!(get_fee_address(&env, token.clone()), per_token);
        assert_eq!(resolve_fee_address(&env, &token).unwrap(), per_token);
    }
}
