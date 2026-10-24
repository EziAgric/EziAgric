# System Context (C4 Level 1)

EziAgric ("Amana") is an escrow service for agricultural trades: buyer funds
are locked in a Soroban smart contract until delivery is confirmed, a dispute
is settled, or the trade is cancelled/expired.

```mermaid
flowchart TB
    buyer["👤 Buyer<br/><i>Pays for produce; confirms full or partial delivery</i>"]
    seller["👤 Seller / Farmer<br/><i>Lists produce, dispatches goods, submits manifest</i>"]
    mediator["👤 Mediator<br/><i>Reviews evidence and resolves disputes (single or quorum)</i>"]
    admin["👤 Platform Admin<br/><i>Fees, registries, pause, timelocked clawback/upgrade</i>"]

    amana(["🌾 EziAgric / Amana<br/>Escrow platform: web, mobile, API and Soroban contract"])

    stellar[("Stellar Network<br/>Soroban RPC + Horizon")]
    wallet["Freighter / Albedo<br/><i>Wallet signing</i>"]
    ipfs[("IPFS via Pinata<br/><i>Video proof & evidence</i>")]
    supabase[("Supabase<br/><i>Auth & profiles</i>")]

    buyer -- "create / fund / confirm trades" --> amana
    seller -- "accept trades, manifest, delivery proof" --> amana
    mediator -- "votes & rulings" --> amana
    admin -- "governance operations" --> amana

    amana -- "invoke contract, stream events" --> stellar
    amana -- "request signatures" --> wallet
    wallet -- "submit signed tx" --> stellar
    amana -- "pin / fetch evidence CIDs" --> ipfs
    amana -- "auth, profile data" --> supabase
```

## Trust boundaries

- **On-chain (authoritative):** escrowed balances, trade status, loss ratios,
  dispute outcomes, fee accrual. Enforced by `contracts/amana_escrow`.
- **Off-chain (derived / supporting):** user profiles, driver logs, evidence
  content, notifications, analytics. See
  [ADR-003](../adr/ADR-003-offchain-vs-onchain-data-partitioning.md).

Next level down: [Containers](./containers.md).
