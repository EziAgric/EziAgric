/// Issue #679 — execute_clawback must re-validate trade status at execution time.
///
/// Covers:
///   1. A clawback queued while the trade is Funded then cancelled before the
///      timelock expires must revert with the status guard message.
#[cfg(test)]
mod clawback_invariant_tests {
    use crate::test_fixture::admin_address;
    use crate::{EscrowContract, EscrowContractClient};
    use soroban_sdk::testutils::{Address as _, Ledger as _};
    use soroban_sdk::{Address, Env, token};

    fn setup_funded(
        env: &Env,
    ) -> (EscrowContractClient<'_>, Address, Address, Address, u64) {
        let contract_id = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(env, &contract_id);
        let admin = admin_address(env);
        let buyer = Address::generate(env);
        let seller = Address::generate(env);
        let treasury = Address::generate(env);
        let token_id = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        client.initialize(&admin, &token_id, &treasury, &0_u32, &token_id);
        let amount = 10_000_i128;
        token::StellarAssetClient::new(env, &token_id).mint(&buyer, &amount);
        let trade_id =
            client.create_trade(&buyer, &seller, &amount, &5000_u32, &5000_u32, &None);
        client.deposit(&trade_id);
        (client, admin, buyer, seller, trade_id)
    }

    /// queue_clawback → cancel trade → advance past delay → execute_clawback
    /// must revert because the trade is no longer in Funded or Disputed status.
    #[test]
    #[should_panic(expected = "Trade must be in Funded or Disputed status for clawback")]
    fn execute_clawback_reverts_when_trade_cancelled_before_execution() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, admin, buyer, seller, trade_id) = setup_funded(&env);

        env.ledger().with_mut(|l| l.timestamp = 1_000);
        let op_id = client.queue_clawback(&trade_id, &5_000_i128, &admin);

        // Cancel the trade (both parties agree) — status becomes Cancelled.
        client.cancel_trade(&trade_id, &buyer);
        client.cancel_trade(&trade_id, &seller);

        // Advance past the default 86 400 s clawback delay.
        env.ledger().with_mut(|l| l.timestamp = 90_000);

        // Must panic: trade is no longer Funded or Disputed.
        client.execute_clawback(&op_id);
    }
}
