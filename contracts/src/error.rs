use soroban_sdk::contracterror;

/// Errors returned by the escrow contract.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    /// The contract has already been initialized.
    AlreadyInitialized = 1,
    /// The contract has not been initialized yet.
    NotInitialized = 2,
    /// Caller is not authorized to perform this action.
    Unauthorized = 3,
    /// The supplied amount is invalid (e.g. zero or negative).
    InvalidAmount = 4,
    /// The supplied trade id does not exist.
    TradeNotFound = 5,
    /// The trade is not in a state that allows the requested operation.
    InvalidTradeState = 6,
    /// The supplied mediator is not in the approved mediator registry.
    InvalidMediator = 7,
}
