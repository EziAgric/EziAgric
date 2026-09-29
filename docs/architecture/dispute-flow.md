# Dispute Flow

Disputes are opened by either party (`initiate_dispute`) or by escalating an
unaccepted partial delivery (`escalate_partial_delivery`). Trades below the
quorum threshold are settled by one mediator; high-value trades need a
weighted mediator quorum.

```mermaid
sequenceDiagram
    autonumber
    actor Party as Buyer / Seller
    actor M1 as Mediator A
    actor M2 as Mediator B
    participant C as Escrow contract
    participant T as cNGN token
    participant L as Event listener

    Party->>C: initiate_dispute(trade_id, reason_hash)
    Note over C: status Funded → Disputed<br/>DisputeRecord stored
    C-->>L: DISINI
    Party->>C: submit_evidence(ipfs_hash, description_hash)
    C-->>L: EVDSUB

    alt Value below quorum threshold (or quorum disabled)
        M1->>C: resolve_dispute(trade_id, seller_gets_bps)
    else Quorum required
        M1->>C: cast_dispute_vote(seller_gets_bps, rationale_hash)
        C-->>L: DVOTE
        M2->>C: cast_dispute_vote(seller_gets_bps, rationale_hash)
        C-->>L: DVOTE
        opt Weight reached required_weight
            Note over C: settles immediately (QuorumOutcome::Quorum)
        end
        opt Vote window closed without quorum
            Party->>C: resolve_dispute_by_fallback
            Note over C: plurality outcome, ties favour buyer
        end
        C-->>L: DQURES
    end

    Note over C: loss split by trade's Loss_Ratio,<br/>1% fee on seller portion only
    C->>T: seller_net → seller
    C->>T: buyer_refund → buyer
    C-->>L: DISRES
```

Settlement math: [ADR-002](../adr/ADR-002-escrow-loss-sharing-model.md).
Quorum policy: [mediator quorum](../mediator-quorum.md).

See also: [Trade lifecycle](./trade-lifecycle.md).
