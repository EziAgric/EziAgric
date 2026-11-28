# Contracts Developer Reference

This document describes the public entrypoints of the escrow contract in
`contracts/src/lib.rs`. It covers function signatures, parameters, return
types, error variants, the trade lifecycle state machine, and example
invocations using the Stellar CLI.

> Keep this document in sync with `contracts/src/lib.rs`. If you change an
> entrypoint signature or error variant, update this file in the same PR.

## Overview

The contract implements a simple escrow between a **seller** and a **buyer**
for a single trade identified by a `trade_id`. Funds are held by the contract
until the buyer confirms delivery (releasing funds to the seller) or the
seller cancels the trade (refunding the buyer).

All entrypoints are exposed via `#[contractimpl]` and are callable through the
Stellar CLI using `stellar contract invoke`.

## Errors

The contract returns a `ContractError` enum. Variants currently defined:

| Variant | Meaning |
| --- | --- |
| `AlreadyInitialized` | `initialize` was called more than once. |
| `NotInitialized` | An entrypoint was called before `initialize`. |
| `TradeNotFound` | No trade exists for the supplied `trade_id`. |
| `InvalidState` | The trade is not in a state that permits the requested transition. |
| `Unauthorized` | The caller is not the expected party (seller or buyer). |
| `InvalidAmount` | The supplied amount is zero or otherwise invalid. |

Refer to `contracts/src/lib.rs` for the authoritative list; add new variants
here when they are introduced.

## State Machine

A trade moves through the following states:

```
          create_trade
   (none) ─────────────▶ Created
                            │
              deposit       │
        (buyer) ────────────▶ Funded
                            │
        confirm_delivery    │            cancel_trade
        (buyer) ────────────▶ Completed  (seller) ─────────▶ Cancelled
```

- **Created** — trade record exists; awaiting buyer deposit.
- **Funded** — buyer has deposited funds into escrow.
- **Completed** — buyer confirmed delivery; funds released to seller.
- **Cancelled** — seller cancelled before completion; funds refunded to buyer.

`Completed` and `Cancelled` are terminal states. Any transition attempted
from a terminal state returns `InvalidState`.

## Entrypoints

### `initialize`

```rust
pub fn initialize(env: Env, admin: Address) -> Result<(), ContractError>
```

- **Description**: One-time setup. Stores the admin address used for
  privileged operations.
- **Parameters**:
  - `admin` (`Address`): account authorized as contract admin.
- **Returns**: `Ok(())` on success.
- **Errors**: `AlreadyInitialized` if called twice.

```sh
stellar contract invoke \
  --id $CONTRACT_ID \
  --source $ADMIN_SECRET \
  -- initialize \
  --admin $ADMIN_ADDRESS
```

### `create_trade`

```rust
pub fn create_trade(
    env: Env,
    trade_id: u64,
    seller: Address,
    buyer: Address,
    amount: i128,
) -> Result<(), ContractError>
```

- **Description**: Creates a new trade in the `Created` state.
- **Parameters**:
  - `trade_id` (`u64`): unique identifier for the trade.
  - `seller` (`Address`): seller account.
  - `buyer` (`Address`): buyer account.
  - `amount` (`i128`): escrow amount in the token's smallest unit.
- **Returns**: `Ok(())` on success.
- **Errors**: `NotInitialized`, `InvalidAmount` (amount ≤ 0),
  `InvalidState` if `trade_id` already exists.

```sh
stellar contract invoke \
  --id $CONTRACT_ID \
  --source $SELLER_SECRET \
  -- create_trade \
  --trade_id 1 \
  --seller $SELLER_ADDRESS \
  --buyer $BUYER_ADDRESS \
  --amount 10000000
```

### `deposit`

```rust
pub fn deposit(env: Env, trade_id: u64, buyer: Address) -> Result<(), ContractError>
```

- **Description**: Buyer deposits the trade amount into escrow, moving the
  trade from `Created` to `Funded`.
- **Parameters**:
  - `trade_id` (`u64`): trade to fund.
  - `buyer` (`Address`): must match the trade's buyer; requires auth.
- **Returns**: `Ok(())` on success.
- **Errors**: `TradeNotFound`, `Unauthorized`, `InvalidState` (trade not in
  `Created`).

```sh
stellar contract invoke \
  --id $CONTRACT_ID \
  --source $BUYER_SECRET \
  -- deposit \
  --trade_id 1 \
  --buyer $BUYER_ADDRESS
```

### `confirm_delivery`

```rust
pub fn confirm_delivery(env: Env, trade_id: u64, buyer: Address) -> Result<(), ContractError>
```

- **Description**: Buyer confirms delivery, releasing escrowed funds to the
  seller and moving the trade from `Funded` to `Completed`.
- **Parameters**:
  - `trade_id` (`u64`): trade to complete.
  - `buyer` (`Address`): must match the trade's buyer; requires auth.
- **Returns**: `Ok(())` on success.
- **Errors**: `TradeNotFound`, `Unauthorized`, `InvalidState` (trade not in
  `Funded`).

```sh
stellar contract invoke \
  --id $CONTRACT_ID \
  --source $BUYER_SECRET \
  -- confirm_delivery \
  --trade_id 1 \
  --buyer $BUYER_ADDRESS
```

### `cancel_trade`

```rust
pub fn cancel_trade(env: Env, trade_id: u64, seller: Address) -> Result<(), ContractError>
```

- **Description**: Seller cancels the trade, refunding any escrowed funds to
  the buyer and moving the trade to `Cancelled`.
- **Parameters**:
  - `trade_id` (`u64`): trade to cancel.
  - `seller` (`Address`): must match the trade's seller; requires auth.
- **Returns**: `Ok(())` on success.
- **Errors**: `TradeNotFound`, `Unauthorized`, `InvalidState` (trade already
  `Completed` or `Cancelled`).

```sh
stellar contract invoke \
  --id $CONTRACT_ID \
  --source $SELLER_SECRET \
  -- cancel_trade \
  --trade_id 1 \
  --seller $SELLER_ADDRESS
```

### `get_trade`

```rust
pub fn get_trade(env: Env, trade_id: u64) -> Result<Trade, ContractError>
```

- **Description**: Read-only lookup of a trade record.
- **Parameters**:
  - `trade_id` (`u64`): trade to fetch.
- **Returns**: `Trade` struct describing the trade and its current state.
- **Errors**: `TradeNotFound`.

```sh
stellar contract invoke \
  --id $CONTRACT_ID \
  --source $ANY_SECRET \
  -- get_trade \
  --trade_id 1
```

## Review Checklist

When changing the contract:

- [ ] Every new/changed public entrypoint is documented above.
- [ ] Error variants match `ContractError` in `contracts/src/lib.rs`.
- [ ] State transitions in the diagram match the implementation.
- [ ] CLI examples still reflect the current argument names.
