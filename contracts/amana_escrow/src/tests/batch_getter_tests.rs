/// Issue #351 — batch getter `get_trades(ids)`.
///
/// Covers:
///   1. Results are returned in input order
///   2. Missing ids yield `None` without panicking
///   3. Duplicate ids are returned once per occurrence
///   4. An empty batch returns an empty vector
///   5. Exactly MAX_TRADE_BATCH ids are accepted
///   6. MAX_TRADE_BATCH + 1 ids are rejected with `EscrowError::BatchTooLarge`
#[cfg(test)]
mod batch_getter_tests {
    use crate::test_fixture::admin_address;
    use crate::{EscrowContract, EscrowContractClient, EscrowError, MAX_TRADE_BATCH};
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::{Address, Env, Vec};

    fn setup(env: &Env) -> (EscrowContractClient<'_>, Address, Address) {
        let contract_id = env.register(EscrowContract, ());
        let client = EscrowContractClient::new(env, &contract_id);
        let admin = admin_address(env);
        let buyer = Address::generate(env);
        let seller = Address::generate(env);
        let treasury = Address::generate(env);
        let token_id = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        client.initialize(&admin, &token_id, &treasury, &100_u32, &token_id);
        (client, buyer, seller)
    }

    fn create(client: &EscrowContractClient<'_>, buyer: &Address, seller: &Address, amount: i128) -> u64 {
        client.create_trade(buyer, seller, &amount, &5000_u32, &5000_u32, &None)
    }

    #[test]
    fn test_get_trades_preserves_input_order() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, buyer, seller) = setup(&env);

        let a = create(&client, &buyer, &seller, 100);
        let b = create(&client, &buyer, &seller, 200);
        let c = create(&client, &buyer, &seller, 300);

        let mut ids = Vec::new(&env);
        ids.push_back(c);
        ids.push_back(a);
        ids.push_back(b);

        let trades = client.get_trades(&ids);
        assert_eq!(trades.len(), 3);
        assert_eq!(trades.get(0).unwrap().unwrap().trade_id, c);
        assert_eq!(trades.get(1).unwrap().unwrap().trade_id, a);
        assert_eq!(trades.get(2).unwrap().unwrap().trade_id, b);
        assert_eq!(trades.get(0).unwrap().unwrap().amount, 300);
        assert_eq!(trades.get(1).unwrap().unwrap(), client.get_trade(&a));
    }

    #[test]
    fn test_get_trades_missing_ids_return_none() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, buyer, seller) = setup(&env);

        let existing = create(&client, &buyer, &seller, 100);

        let mut ids = Vec::new(&env);
        ids.push_back(999_999_u64);
        ids.push_back(existing);
        ids.push_back(0_u64);

        let trades = client.get_trades(&ids);
        assert_eq!(trades.len(), 3);
        assert_eq!(trades.get(0).unwrap(), None);
        assert_eq!(trades.get(1).unwrap().unwrap().trade_id, existing);
        assert_eq!(trades.get(2).unwrap(), None);
    }

    #[test]
    fn test_get_trades_duplicate_ids_are_repeated() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, buyer, seller) = setup(&env);

        let id = create(&client, &buyer, &seller, 100);
        let mut ids = Vec::new(&env);
        ids.push_back(id);
        ids.push_back(id);

        let trades = client.get_trades(&ids);
        assert_eq!(trades.len(), 2);
        assert_eq!(trades.get(0).unwrap(), trades.get(1).unwrap());
    }

    #[test]
    fn test_get_trades_empty_batch() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _, _) = setup(&env);

        let trades = client.get_trades(&Vec::new(&env));
        assert_eq!(trades.len(), 0);
    }

    #[test]
    fn test_get_trades_accepts_max_batch() {
        let env = Env::default();
        env.mock_all_auths();
        let (client, _, _) = setup(&env);

        let mut ids = Vec::new(&env);
        for i in 0..MAX_TRADE_BATCH {
            ids.push_back(i as u64);
        }

        let trades = client.get_trades(&ids);
        assert_eq!(trades.len(), MAX_TRADE_BATCH);
        for trade in trades.iter() {
            assert_eq!(trade, None);
        }
    }

    /// `EscrowError::BatchTooLarge` is contract error code 1.
    #[test]
    #[should_panic(expected = "Error(Contract, #1)")]
    fn test_get_trades_rejects_oversized_batch_with_typed_error() {
        assert_eq!(EscrowError::BatchTooLarge as u32, 1);

        let env = Env::default();
        env.mock_all_auths();
        let (client, _, _) = setup(&env);

        let mut ids = Vec::new(&env);
        for i in 0..(MAX_TRADE_BATCH + 1) {
            ids.push_back(i as u64);
        }

        client.get_trades(&ids);
    }
}
