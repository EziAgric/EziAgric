use soroban_sdk::{contract, contracterror, contractimpl, contracttype, Address, Env};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    SelfTrade = 3,
    InvalidAmount = 4,
    TradeNotFound = 5,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Trade {
    pub buyer: Address,
    pub seller: Address,
    pub amount: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Trade(u64),
    NextTradeId,
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    pub fn create_trade(
        env: Env,
        buyer: Address,
        seller: Address,
        amount: i128,
    ) -> Result<u64, Error> {
        if buyer == seller {
            return Err(Error::SelfTrade);
        }
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let trade_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextTradeId)
            .unwrap_or(0);

        let trade = Trade {
            buyer,
            seller,
            amount,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Trade(trade_id), &trade);
        env.storage()
            .instance()
            .set(&DataKey::NextTradeId, &(trade_id + 1));

        Ok(trade_id)
    }

    pub fn get_trade(env: Env, trade_id: u64) -> Result<Trade, Error> {
        env.storage()
            .persistent()
            .get(&DataKey::Trade(trade_id))
            .ok_or(Error::TradeNotFound)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::testutils::Address as _;
    use soroban_sdk::Env;

    #[test]
    fn create_trade_rejects_self_trade() {
        let env = Env::default();
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        let party = Address::generate(&env);

        let result = client.try_create_trade(&party, &party, &100);
        assert_eq!(result, Err(Ok(Error::SelfTrade)));
    }

    #[test]
    fn create_trade_succeeds_for_different_parties() {
        let env = Env::default();
        let contract_id = env.register_contract(None, EscrowContract);
        let client = EscrowContractClient::new(&env, &contract_id);

        let buyer = Address::generate(&env);
        let seller = Address::generate(&env);

        let trade_id = client.create_trade(&buyer, &seller, &100);
        assert_eq!(trade_id, 0);

        let trade = client.get_trade(&trade_id);
        assert_eq!(trade.buyer, buyer);
        assert_eq!(trade.seller, seller);
        assert_eq!(trade.amount, 100);
    }
}
