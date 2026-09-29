# Containers (C4 Level 2)

```mermaid
flowchart LR
    subgraph clients["Clients"]
        web["Web app<br/><code>frontend/</code><br/>Next.js App Router"]
        mobile["Mobile app<br/><code>mobile/</code><br/>React Native / Expo"]
    end

    subgraph platform["EziAgric platform"]
        api["API server<br/><code>backend/src/app.ts</code><br/>Node.js / TypeScript"]
        listener["Event listener<br/><code>eventListener.service.ts</code>"]
        workers["Background workers<br/><code>backend/src/jobs</code><br/>expiry, reconciliation, outbox"]
        pg[("PostgreSQL<br/>Prisma schema")]
        redis[("Redis<br/>cache, locks, queues")]
    end

    subgraph chain["Stellar"]
        contract["Escrow contract<br/><code>contracts/amana_escrow</code><br/>Soroban / Rust"]
        token["cNGN token<br/>(SAC)"]
        horizon["Horizon<br/>path-payment quotes"]
    end

    ipfs[("IPFS / Pinata")]
    wallet["Freighter / Albedo"]

    web -- "REST / JSON" --> api
    mobile -- "REST / JSON" --> api
    web -- "sign XDR" --> wallet
    mobile -- "sign XDR" --> wallet
    wallet -- "submit tx" --> contract

    api -- "simulate & build tx<br/>get_trade / get_trades" --> contract
    api -- "quotes" --> horizon
    api --> pg
    api --> redis
    api -- "pin evidence" --> ipfs

    contract -- "transfer" --> token
    contract -. "events (TRDCRT, TRDFND, PARTDL, DISRES …)" .-> listener
    listener --> pg
    listener --> workers
    workers --> pg
    workers --> redis
    workers -- "admin / expiry tx" --> contract
```

## Notes

- The contract is the source of truth for money; PostgreSQL holds a projection
  rebuilt from contract events (see [event flow](../event-flow.md)).
- Dashboards and the event listener read trades in pages via the batch getter
  `get_trades(ids)` (max 50 ids per call) instead of one `get_trade` per row.
- Path-payment funding (NGN → cNGN) is described in
  [ADR-001](../adr/ADR-001-stellar-path-payment-architecture.md).

Up: [System context](./system-context.md) · Down: [Contract modules](./contract-modules.md)
