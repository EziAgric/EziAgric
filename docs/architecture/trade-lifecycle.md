# Trade Lifecycle

## On-chain state machine

`TradeStatus` in `contracts/amana_escrow/src/types.rs`.

```mermaid
stateDiagram-v2
    [*] --> Created: create_trade
    Created --> Funded: deposit / finalize_path_payment
    Created --> Cancelled: cancel_trade / cancel_by_buyer

    Funded --> Delivered: confirm_delivery
    Funded --> Completed: accept_partial_delivery (pro-rata)
    Funded --> Disputed: initiate_dispute / escalate_partial_delivery
    Funded --> Cancelled: cancel_trade (both parties or admin) / refund / claim_expiry_refund
    Funded --> Funded: extend_deadline / confirm_partial_delivery (pending)

    Delivered --> Completed: release_funds
    Delivered --> Cancelled: refund (seller)

    Disputed --> Completed: resolve_dispute / quorum vote / fallback

    Funded --> Cancelled: admin_clawback (full)
    Disputed --> Cancelled: admin_clawback (full)

    Completed --> [*]
    Cancelled --> [*]
```

## Happy path and partial delivery

```mermaid
sequenceDiagram
    autonumber
    actor Buyer
    actor Seller
    participant API as API server
    participant C as Escrow contract
    participant T as cNGN token
    participant L as Event listener

    Buyer->>API: create trade (amount, loss ratio, deadline)
    API->>C: create_trade(buyer, seller, amount, buyer_loss_bps, seller_loss_bps, expires_at)
    C-->>L: TRDCRT
    Buyer->>C: deposit(trade_id)
    C->>T: transfer buyer → escrow
    C-->>L: TRDFND
    Seller->>C: submit_manifest(driver hashes)
    C-->>L: MNFST

    alt Full delivery
        Buyer->>C: confirm_delivery
        C-->>L: DELCNF
        Buyer->>C: release_funds
        C->>T: transfer escrow → seller (amount − 1% fee)
        C-->>L: RELSD
    else Partial delivery (e.g. 80 of 100 bags)
        Buyer->>C: confirm_partial_delivery(trade_id, 8000 bps)
        C-->>L: PDPROP (accept_by = now + 3 days)
        alt Seller accepts within window
            Seller->>C: accept_partial_delivery
            C->>T: seller ← delivered − fee + buyer-borne loss
            C->>T: buyer ← seller-borne share of undelivered
            C-->>L: PARTDL (all amounts)
        else Seller rejects or window lapses
            Seller->>C: escalate_partial_delivery (any time)
            Buyer->>C: escalate_partial_delivery (after accept_by)
            C-->>L: DISINI → see dispute flow
        end
    end
    L->>API: project events into PostgreSQL
```

Money math for every branch is documented in
[the contract overview](../eziagric_contract_overview.md#partial-delivery) and
[ADR-002](../adr/ADR-002-escrow-loss-sharing-model.md).

See also: [Dispute flow](./dispute-flow.md).
