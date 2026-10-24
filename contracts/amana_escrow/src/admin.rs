//! Admin, governance and emergency entrypoints: initialization, mediator and
//! guardian registries, pause, asset allowlist, timelocked clawback/upgrade
//! and configuration getters.

use soroban_sdk::{Address, BytesN, Env, contractimpl, token};

use crate::*;

#[contractimpl]
impl EscrowContract {
    // -----------------------------------------------------------------------
    // Admin / Setup
    // -----------------------------------------------------------------------

    pub fn initialize(
        env: Env,
        admin: Address,
        cngn_contract: Address,
        treasury: Address,
        fee_bps: u32,
        source_token: Address,
    ) {
        if env.storage().instance().has(&DataKey::Initialized) {
            panic!("AlreadyInitialized");
        }
        assert!(fee_bps <= 10_000, "fee_bps must not exceed 10000");
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::CngnContract, &cngn_contract);
        env.storage().instance().set(&DataKey::Treasury, &treasury);
        env.storage().instance().set(&DataKey::FeeBps, &fee_bps);
        env.storage()
            .instance()
            .set(&DataKey::SourceToken, &source_token);
        env.storage().instance().set(&DataKey::Initialized, &true);
        env.storage()
            .instance()
            .set(&DataKey::SchemaVersion, &CURRENT_SCHEMA_VERSION);
        let timelock_config = TimelockConfig {
            clawback_delay_seconds: 86400,
            upgrade_delay_seconds: 604800,
        };
        env.storage()
            .instance()
            .set(&DataKey::TimelockConfig, &timelock_config);
        env.storage().instance().set(&DataKey::NextTimelockId, &0u64);
        Self::bump_instance_ttl(&env);
        InitializedEvent { admin, fee_bps, timestamp: env.ledger().timestamp() }.publish(&env);
    }

    /// Register a single legacy mediator address. Only the admin may call this.
    /// For multi-mediator support, prefer `add_mediator()`.
    /// Emits `MediatorAdded` so governance indexers see every registration path.
    pub fn set_mediator(env: Env, mediator: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        admin.require_auth();
        env.storage().instance().set(&DataKey::Mediator, &mediator);
        // Also register in the per-address registry so is_mediator() reflects this.
        env.storage()
            .persistent()
            .set(&DataKey::MediatorRegistry(mediator.clone()), &true);
        MediatorAddedEvent {
            mediator: mediator.clone(),
        }
        .publish(&env);
    }

    // -----------------------------------------------------------------------
    // Mediator registry
    // -----------------------------------------------------------------------

    /// Add `mediator_address` to the approved mediator registry.
    /// Admin only. Emits `MediatorAdded`.
    pub fn add_mediator(env: Env, mediator_address: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        admin.require_auth();
        env.storage()
            .persistent()
            .set(&DataKey::MediatorRegistry(mediator_address.clone()), &true);
        MediatorAddedEvent {
            mediator: mediator_address,
        }
        .publish(&env);
    }

    /// Remove `mediator_address` from the approved mediator registry.
    /// Also clears the legacy single-mediator slot if it holds the same address,
    /// ensuring revocation is complete regardless of which registration path was used.
    /// Admin only. Emits `MediatorRemoved`.
    pub fn remove_mediator(env: Env, mediator_address: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        admin.require_auth();

        // Clear registry slot (add_mediator / set_mediator dual-writes here)
        env.storage()
            .persistent()
            .remove(&DataKey::MediatorRegistry(mediator_address.clone()));

        // Clear legacy slot if it points to the same address
        if let Some(legacy) = env
            .storage()
            .instance()
            .get::<_, Address>(&DataKey::Mediator)
        {
            if legacy == mediator_address {
                env.storage().instance().remove(&DataKey::Mediator);
            }
        }

        MediatorRemovedEvent {
            mediator: mediator_address,
        }
        .publish(&env);
    }

    /// Returns `true` if `address` is currently in the approved mediator registry.
    /// Read-only; callable by anyone.
    pub fn is_mediator(env: Env, address: Address) -> bool {
        env.storage()
            .persistent()
            .get::<_, bool>(&DataKey::MediatorRegistry(address))
            .unwrap_or(false)
    }

    // -----------------------------------------------------------------------
    // Guardian multisig — emergency pause (#188)
    // -----------------------------------------------------------------------

    /// Registers an address as an authorized guardian.
    /// Only the contract admin may call this.
    pub fn add_guardian(env: Env, guardian: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized");
        admin.require_auth();
        env.storage()
            .persistent()
            .set(&DataKey::GuardianRegistry(guardian), &true);
        Self::bump_instance_ttl(&env);
    }

    /// Removes a guardian. Admin only.
    pub fn remove_guardian(env: Env, guardian: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized");
        admin.require_auth();
        env.storage()
            .persistent()
            .remove(&DataKey::GuardianRegistry(guardian));
        Self::bump_instance_ttl(&env);
    }

    /// Returns true when the given address is a registered guardian.
    pub fn is_guardian(env: Env, address: Address) -> bool {
        env.storage()
            .persistent()
            .get::<_, bool>(&DataKey::GuardianRegistry(address))
            .unwrap_or(false)
    }

    /// Pauses all state-changing contract operations. Caller must be a guardian.
    pub fn pause(env: Env, guardian: Address) {
        guardian.require_auth();
        assert!(
            env.storage()
                .persistent()
                .get::<_, bool>(&DataKey::GuardianRegistry(guardian))
                .unwrap_or(false),
            "caller is not a guardian"
        );
        env.storage().instance().set(&DataKey::Paused, &true);
        Self::bump_instance_ttl(&env);
    }

    /// Unpauses the contract. Caller must be a guardian.
    /// A timelock is not enforced here — the admin may also unpause via admin key
    /// to recover from an accidental freeze; the incident runbook covers both paths.
    pub fn unpause(env: Env, guardian: Address) {
        guardian.require_auth();
        assert!(
            env.storage()
                .persistent()
                .get::<_, bool>(&DataKey::GuardianRegistry(guardian))
                .unwrap_or(false),
            "caller is not a guardian"
        );
        env.storage().instance().set(&DataKey::Paused, &false);
        Self::bump_instance_ttl(&env);
    }

    /// Returns true when the contract is currently paused.
    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false)
    }

    // -----------------------------------------------------------------------
    // Multi-asset allowlist (#187)
    // -----------------------------------------------------------------------

    /// Registers an asset contract address as allowed for escrow operations.
    /// `decimals` controls fixed-point display for downstream clients.
    /// Admin only.
    pub fn allow_asset(env: Env, asset: Address, decimals: u32) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized");
        admin.require_auth();
        assert!(decimals <= 18, "decimals must be <= 18");
        env.storage()
            .persistent()
            .set(&DataKey::AllowedAsset(asset.clone()), &true);
        env.storage()
            .persistent()
            .set(&DataKey::AssetDecimals(asset), &decimals);
        Self::bump_instance_ttl(&env);
    }

    /// Removes an asset from the allowlist. Admin only.
    pub fn disallow_asset(env: Env, asset: Address) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("not initialized");
        admin.require_auth();
        env.storage()
            .persistent()
            .remove(&DataKey::AllowedAsset(asset.clone()));
        env.storage()
            .persistent()
            .remove(&DataKey::AssetDecimals(asset));
        Self::bump_instance_ttl(&env);
    }

    /// Returns true when the given asset contract address is on the allowlist.
    pub fn is_asset_allowed(env: Env, asset: Address) -> bool {
        env.storage()
            .persistent()
            .get::<_, bool>(&DataKey::AllowedAsset(asset))
            .unwrap_or(false)
    }

    /// Returns the decimal precision stored for an allowed asset.
    pub fn get_asset_decimals(env: Env, asset: Address) -> Option<u32> {
        env.storage()
            .persistent()
            .get(&DataKey::AssetDecimals(asset))
    }

    /// Returns the persistent storage schema version of this contract instance.
    ///
    /// Instances initialized before schema versioning existed have no stored
    /// value and report version 1 (the original layout), so upgrades can branch
    /// on this number to decide whether a migration is required. Read-only.
    pub fn get_schema_version(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::SchemaVersion)
            .unwrap_or(CURRENT_SCHEMA_VERSION)
    }

    // -----------------------------------------------------------------------
    // Timelock operations (Issue #189)
    // -----------------------------------------------------------------------

    pub fn queue_clawback(
        env: Env,
        trade_id: u64,
        clawback_amount: i128,
        destination: Address,
    ) -> u64 {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        admin.require_auth();

        assert!(
            clawback_amount > 0,
            "{}",
            clawback_errors::INVALID_AMOUNT
        );

        let config: TimelockConfig = env
            .storage()
            .instance()
            .get(&DataKey::TimelockConfig)
            .unwrap_or(TimelockConfig {
                clawback_delay_seconds: 86400,
                upgrade_delay_seconds: 604800,
            });

        let now = env.ledger().timestamp();
        let execute_after = now + config.clawback_delay_seconds;
        let operation_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextTimelockId)
            .unwrap_or(0);

        let queued_op = QueuedOperation {
            operation_id,
            operation_type: soroban_sdk::String::from_str(&env, "clawback"),
            payload: TimelockOpPayload::Clawback(TimelockClawbackOp {
                trade_id,
                clawback_amount,
                destination,
            }),
            queued_at: now,
            execute_after,
            executed: false,
            cancelled: false,
            admin: admin.clone(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::TimelockOperation(operation_id), &queued_op);
        env.storage()
            .instance()
            .set(&DataKey::NextTimelockId, &(operation_id + 1));

        TimelockOperationQueued {
            operation_id,
            operation_type: soroban_sdk::String::from_str(&env, "clawback"),
            queued_at: now,
            execute_after,
            admin,
        }
        .publish(&env);

        Self::bump_instance_ttl(&env);
        operation_id
    }

    pub fn execute_clawback(env: Env, operation_id: u64) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        admin.require_auth();

        let key = DataKey::TimelockOperation(operation_id);
        let mut queued_op: QueuedOperation = env
            .storage()
            .persistent()
            .get(&key)
            .expect("operation not found");

        let now = env.ledger().timestamp();
        assert!(now >= queued_op.execute_after, "operation not ready for execution");
        assert!(!queued_op.executed, "operation already executed");
        assert!(!queued_op.cancelled, "operation has been cancelled");

        if let TimelockOpPayload::Clawback(clawback_op) = queued_op.payload.clone() {
            assert!(
                clawback_op.clawback_amount > 0,
                "{}",
                clawback_errors::INVALID_AMOUNT
            );

            let trade_key = DataKey::Trade(clawback_op.trade_id);
            let mut trade: Trade = Self::load_trade(&env, &trade_key);

            assert!(
                matches!(trade.status, TradeStatus::Funded | TradeStatus::Disputed),
                "Trade must be in Funded or Disputed status for clawback"
            );
            assert!(
                clawback_op.clawback_amount <= trade.amount,
                "clawback_amount exceeds remaining escrowed amount"
            );

            let token_client = token::Client::new(&env, &trade.token);
            token_client.transfer(
                &env.current_contract_address(),
                &clawback_op.destination,
                &clawback_op.clawback_amount,
            );

            trade.amount -= clawback_op.clawback_amount;
            if trade.amount == 0 {
                trade.status = TradeStatus::Cancelled;
            }
            trade.updated_at = now;
            Self::save_trade(&env, &trade_key, &trade);

            let clawback_total: i128 = env
                .storage()
                .persistent()
                .get::<_, i128>(&DataKey::ClawbackTotal(clawback_op.trade_id))
                .unwrap_or(0);
            env.storage()
                .persistent()
                .set(
                    &DataKey::ClawbackTotal(clawback_op.trade_id),
                    &(clawback_total + clawback_op.clawback_amount),
                );

            queued_op.executed = true;
            env.storage().persistent().set(&key, &queued_op);

            TimelockOperationExecuted {
                operation_id,
                executed_at: now,
            }
            .publish(&env);
        }

        Self::bump_instance_ttl(&env);
    }

    pub fn cancel_queued_operation(env: Env, operation_id: u64) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        admin.require_auth();

        let key = DataKey::TimelockOperation(operation_id);
        let mut queued_op: QueuedOperation = env
            .storage()
            .persistent()
            .get(&key)
            .expect("operation not found");

        assert!(!queued_op.executed, "cannot cancel executed operation");
        assert!(!queued_op.cancelled, "operation already cancelled");

        queued_op.cancelled = true;
        env.storage().persistent().set(&key, &queued_op);

        let now = env.ledger().timestamp();
        TimelockOperationCancelled {
            operation_id,
            cancelled_at: now,
            admin,
        }
        .publish(&env);

        Self::bump_instance_ttl(&env);
    }

    pub fn get_queued_operation(env: Env, operation_id: u64) -> Option<QueuedOperation> {
        env.storage()
            .persistent()
            .get(&DataKey::TimelockOperation(operation_id))
    }

    /// Perform a partial (or full) admin clawback on an escrowed trade.
    ///
    /// The admin may call this any number of times as long as funds remain in
    /// escrow. Each call reduces `trade.amount` by `clawback_amount` and
    /// transfers that amount to `destination`. When the remaining balance
    /// reaches zero the trade is transitioned to `Cancelled`.
    ///
    /// # Safety invariants
    /// - Trade must be in `Funded` or `Disputed` status.
    /// - `clawback_amount` must be `> 0` (panics with [`clawback_errors::INVALID_AMOUNT`] /
    ///   `CLAWBACK_INVALID_AMOUNT` for zero or negative amounts).
    /// - `clawback_amount` must be ≤ remaining `trade.amount` (no over-clawback).
    /// - Cumulative `ClawbackTotal` is updated on every call for auditability.
    ///
    /// # Access control (Issue #105 audit)
    /// The admin address is read directly from instance storage — never taken
    /// as a caller-supplied argument — so it cannot be spoofed. `require_auth()`
    /// is invoked on that stored address before any state is read or mutated,
    /// so an unauthorized caller cannot reach the storage/transfer logic below
    /// even under a mocked-auth test harness. There is no implicit admin
    /// fallback: if `DataKey::Admin` was never set, `expect("Not initialized")`
    /// panics rather than defaulting to an open-access state.
    ///
    /// # Feature gating (Issue #113)
    /// Also requires `ClawbackEnabled` (see `set_clawback_enabled`) to be true;
    /// this lets an admin freeze clawbacks during a staged rollout or incident
    /// without a contract upgrade.
    ///
    /// Emits [`ClawbackExecutedEvent`] including the `schema_version` field so
    /// listeners can detect future structural additions.
    pub fn admin_clawback(env: Env, trade_id: u64, clawback_amount: i128, destination: Address) {
        // ACCESS CONTROL: admin is read from storage (not a param), then
        // require_auth() is enforced before any state is touched.
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        admin.require_auth();

        assert!(
            Self::is_clawback_enabled(env.clone()),
            "admin_clawback: clawback feature is currently disabled"
        );

        assert!(
            clawback_amount > 0,
            "{}",
            clawback_errors::INVALID_AMOUNT
        );

        let key = DataKey::Trade(trade_id);
        let mut trade: Trade = Self::load_trade(&env, &key);

        assert!(
            matches!(trade.status, TradeStatus::Funded | TradeStatus::Disputed),
            "Trade must be in Funded or Disputed status for clawback"
        );
        assert!(
            clawback_amount <= trade.amount,
            "clawback_amount exceeds remaining escrowed amount"
        );

        // Transfer clawback funds out of escrow
        let token_client = token::Client::new(&env, &trade.token);
        token_client.transfer(
            &env.current_contract_address(),
            &destination,
            &clawback_amount,
        );

        // Track cumulative clawback for this trade
        let clawback_key = DataKey::ClawbackTotal(trade_id);
        let prior_clawback_total: i128 = env
            .storage()
            .persistent()
            .get(&clawback_key)
            .unwrap_or(0_i128);
        let new_clawback_total = prior_clawback_total
            .checked_add(clawback_amount)
            .expect("clawback total overflow");
        env.storage()
            .persistent()
            .set(&clawback_key, &new_clawback_total);

        // Reduce the escrowed amount
        let remaining_amount = trade.amount - clawback_amount;
        trade.amount = remaining_amount;
        let now = env.ledger().timestamp();
        trade.updated_at = now;

        // If nothing remains, transition to Cancelled
        if remaining_amount == 0 {
            trade.status = TradeStatus::Cancelled;
            Self::update_release_sequence(&env, &trade, |sequence, at| {
                sequence.cancelled_at = Some(at);
            });
            Self::record_trade_event(
                &env,
                trade_id,
                "clawback_full",
                admin.clone(),
                "admin full clawback — trade cancelled",
            );
        } else {
            Self::record_trade_event(
                &env,
                trade_id,
                "clawback_partial",
                admin.clone(),
                "admin partial clawback",
            );
        }

        Self::save_trade(&env, &key, &trade);

        ClawbackExecutedEvent {
            trade_id,
            clawback_amount,
            remaining_amount,
            destination,
            admin,
            schema_version: EVENT_SCHEMA_VERSION,
        }
        .publish(&env);

        Self::bump_instance_ttl(&env);
    }

    /// Return the cumulative amount clawed back from a given trade by the admin.
    /// Returns 0 if no clawback has been performed on this trade.
    pub fn get_clawback_total(env: Env, trade_id: u64) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::ClawbackTotal(trade_id))
            .unwrap_or(0_i128)
    }

    /// Deployment-time enablement switch for `admin_clawback` (Issue #113).
    /// Admin-only. Lets a rollout stage or freeze the clawback feature without
    /// a contract upgrade.
    pub fn set_clawback_enabled(env: Env, enabled: bool) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        admin.require_auth();

        env.storage()
            .instance()
            .set(&DataKey::ClawbackEnabled, &enabled);
        Self::bump_instance_ttl(&env);
    }

    /// Whether `admin_clawback` is currently enabled. Defaults to `true` when
    /// unset so upgrading existing deployments preserves current behavior;
    /// call `set_clawback_enabled(false)` to opt into a staged rollout.
    pub fn is_clawback_enabled(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::ClawbackEnabled)
            .unwrap_or(true)
    }

    /// Return the total amount claimed (released) from a given trade.
    /// This calculates the amount based on trade status and clawback history.
    /// Returns 0 if the trade has not completed or no funds have been released.
    pub fn get_claimed_amount(env: Env, trade_id: u64) -> i128 {
        let key = DataKey::Trade(trade_id);
        if !env.storage().persistent().has(&key) {
            return 0;
        }
        let trade: Trade = Self::load_trade(&env, &key);
        
        match trade.status {
            TradeStatus::Completed => {
                let original_amount = trade.amount;
                let clawed_back = Self::get_clawback_total(env, trade_id);
                original_amount.saturating_sub(clawed_back)
            }
            _ => 0
        }
    }

    /// Return accounting summary for a trade stream: original amount, claimed, and clawed back.
    /// Returns a tuple of (original_amount, claimed_amount, clawback_total).
    pub fn get_stream_accounting(env: Env, trade_id: u64) -> (i128, i128, i128) {
        let key = DataKey::Trade(trade_id);
        if !env.storage().persistent().has(&key) {
            return (0, 0, 0);
        }
        let trade: Trade = Self::load_trade(&env, &key);
        let original_amount = trade.amount;
        let clawback_total = Self::get_clawback_total(env.clone(), trade_id);
        let claimed_amount = Self::get_claimed_amount(env, trade_id);
        
        (original_amount, claimed_amount, clawback_total)
    }

    // -----------------------------------------------------------------------
    // Upgrade operations (Issue #193)
    // -----------------------------------------------------------------------

    pub fn queue_upgrade(env: Env, new_wasm_hash: BytesN<32>) -> u64 {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        admin.require_auth();

        let config: TimelockConfig = env
            .storage()
            .instance()
            .get(&DataKey::TimelockConfig)
            .unwrap_or(TimelockConfig {
                clawback_delay_seconds: 86400,
                upgrade_delay_seconds: 604800,
            });

        let now = env.ledger().timestamp();
        let execute_after = now + config.upgrade_delay_seconds;
        let operation_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextTimelockId)
            .unwrap_or(0);

        let queued_op = QueuedOperation {
            operation_id,
            operation_type: soroban_sdk::String::from_str(&env, "upgrade"),
            payload: TimelockOpPayload::Upgrade(TimelockUpgradeOp {
                new_wasm_hash: new_wasm_hash.clone(),
            }),
            queued_at: now,
            execute_after,
            executed: false,
            cancelled: false,
            admin: admin.clone(),
        };

        env.storage()
            .persistent()
            .set(&DataKey::TimelockOperation(operation_id), &queued_op);
        env.storage()
            .instance()
            .set(&DataKey::NextTimelockId, &(operation_id + 1));

        ContractUpgradeQueued {
            operation_id,
            new_wasm_hash,
            queued_at: now,
            execute_after,
        }
        .publish(&env);

        Self::bump_instance_ttl(&env);
        operation_id
    }

    pub fn execute_upgrade(env: Env, operation_id: u64) {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized");
        admin.require_auth();

        let key = DataKey::TimelockOperation(operation_id);
        let mut queued_op: QueuedOperation = env
            .storage()
            .persistent()
            .get(&key)
            .expect("operation not found");

        let now = env.ledger().timestamp();
        assert!(now >= queued_op.execute_after, "operation not ready for execution");
        assert!(!queued_op.executed, "operation already executed");
        assert!(!queued_op.cancelled, "operation has been cancelled");

        if let TimelockOpPayload::Upgrade(upgrade_op) = queued_op.payload.clone() {
            let new_wasm_hash = upgrade_op.new_wasm_hash.clone();
            env.deployer()
                .update_current_contract_wasm(upgrade_op.new_wasm_hash);

            queued_op.executed = true;
            env.storage().persistent().set(&key, &queued_op);

            ContractUpgradedEvent {
                admin,
                new_wasm_hash,
            }
            .publish(&env);
        }

        Self::bump_instance_ttl(&env);
    }

    pub fn get_source_token(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::SourceToken)
            .expect("SourceToken not configured")
    }

    /// Return the admin address.
    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .expect("Not initialized")
    }

    /// Return the token contract address (formerly cngn_contract).
    pub fn get_token_contract(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::CngnContract)
            .expect("Not initialized")
    }

    /// Return the treasury address.
    pub fn get_treasury(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Treasury)
            .expect("Not initialized")
    }
}
