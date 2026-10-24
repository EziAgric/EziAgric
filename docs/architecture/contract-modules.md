# Contract Modules

`contracts/amana_escrow/src` is split into cohesive modules. Each `*.rs`
module adds its own `#[contractimpl] impl EscrowContract` block; the exported
function set, storage keys and event topics are unchanged by the split.

```mermaid
flowchart TB
    lib["lib.rs<br/>crate root, constants,<br/><code>#35;[contract] EscrowContract</code>"]

    subgraph entry["#35;[contractimpl] entrypoints"]
        admin["admin.rs<br/>initialize, registries, pause,<br/>assets, timelock, clawback, upgrade"]
        fees["fees.rs<br/>fee rate, withdraw, bps math"]
        trade["trade.rs<br/>lifecycle, extensions, delivery,<br/>views incl. get_trades"]
        partial["partial_delivery.rs<br/>confirm / accept / escalate"]
        dispute["dispute.rs<br/>disputes, quorum, evidence"]
    end

    subgraph shared["Shared definitions"]
        storage["storage.rs<br/>DataKey + storage helpers"]
        types["types.rs<br/>#35;[contracttype] values"]
        events["events.rs<br/>#35;[contractevent] structs"]
        errors["errors.rs<br/>error codes, EscrowError"]
    end

    lib --> entry
    lib --> shared
    admin --> storage
    trade --> storage
    partial --> storage
    dispute --> storage
    partial --> fees
    trade --> fees
    dispute --> fees
    partial -- "escalation" --> dispute
    entry --> events
    entry --> types
    trade --> errors
```

The full module map lives in the
[contract overview](../eziagric_contract_overview.md#module-map).

Up: [Containers](./containers.md)
