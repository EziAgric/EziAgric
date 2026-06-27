# Amana Backend: Architecture & Data Flow

## Overview

The Amana backend is a Node.js/TypeScript service providing REST APIs for escrow trade management, dispute resolution, and evidence handling on the Stellar/Soroban network. It acts as the orchestration layer between web/mobile clients and on-chain smart contracts.

## System Architecture

### High-Level Provider Tree

```
┌─────────────────────────────────────────────────────────────┐
│                    Express REST API                          │
│            (Port 4000, 100KB request limit)                 │
└─────────────┬───────────────────────────────────────────────┘
              │
              ├─────────────────────────────────────────┐
              │                                          │
    ┌─────────▼──────────┐              ┌──────────────▼────────┐
    │ Trade Routes       │              │ Other Routers         │
    │ ├─ POST /trades    │              │ ├─ /auth              │
    │ ├─ GET /trades     │              │ ├─ /wallet            │
    │ ├─ POST /:id/...   │              │ ├─ /manifest          │
    │ └─ POST /:id/disp. │              │ ├─ /disputes          │
    └─────────┬──────────┘              │ ├─ /evidence          │
              │                         │ ├─ /audit-trail       │
              ├─────────────────────────┤ └─ /goals              │
              │                         └──────────────┬────────┘
    ┌─────────▼──────────────────────────────────────▼────┐
    │          Service Layer                               │
    │  ├─ TradeService      (trade lifecycle)             │
    │  ├─ ContractService   (Soroban interaction)         │
    │  ├─ AuthService       (JWT + wallet signing)        │
    │  ├─ ManifestService   (PoD uploads)                 │
    │  ├─ EvidenceService   (IPFS streaming)              │
    │  ├─ AuditTrailService (immutable audit logs)        │
    │  ├─ DisputeService    (dispute orchestration)       │
    │  └─ ReputationService (user scoring)                │
    └─────────┬──────────────────────────────────────────┘
              │
              ├────────────────────┬──────────────────┬─────────────┐
              │                    │                  │             │
    ┌─────────▼──────┐  ┌──────────▼────┐  ┌─────────▼────┐  ┌────▼──────┐
    │ Data Access    │  │ Blockchain    │  │   External   │  │ Utilities │
    │                │  │               │  │   Services   │  │           │
    │ ├─ Prisma ORM  │  │ ├─ Stellar SDK│  │              │  │ ├─ Retry  │
    │ │  (PostgreSQL)│  │ ├─ Soroban RPC│  │ ├─ Supabase   │  │ ├─ Circuit│
    │ │              │  │ ├─ Event      │  │ ├─ Pinata IPFS│  │ │ Breaker │
    │ │              │  │ │  Listener   │  │ ├─ Redis      │  │ ├─ Metrics│
    │ │              │  │ └─ Networks   │  │ └─ JWTs       │  │ └─ Logger │
    │ │              │  │    (testnet/  │  │               │  │           │
    │ │              │  │     mainnet)  │  │               │  │           │
    │ └──────────────┘  └───────────────┘  │               │  └───────────┘
    │                                       └───────────────┘
    └───────────────────────────────────────────────────────────┘
```

## Provider Architecture

### 1. **HTTP Request Pipeline**

```
Request → Middleware Stack → Route Handler → Service → Data Layer
```

**Middleware (in order):**

1. `correlationIdMiddleware` - Attach correlation/request IDs
2. `tracingMiddleware` - Create OpenTelemetry spans
3. `loggerMiddleware` - JSON logging with Pino
4. `authMiddleware` - JWT validation (protected routes)
5. `validateRequest` - Zod schema validation
6. `idempotencyMiddleware` - Prevent duplicate operations
7. Error handlers (catch-all)

### 2. **Service Layer**

Each service handles a domain responsibility and does NOT call other services (one-way dependency).

#### TradeService

```typescript
class TradeService {
  createPendingTrade(); // Initialize trade in PENDING_SIGNATURE
  listUserTrades(); // Paginated trade list with filters/sort
  getTrade(); // Retrieve single trade
  depositFundsTransaction(); // Build Stellar tx for escrow funding
  confirmDelivery(); // Mark trade as DELIVERED (buyer)
  releaseEscrow(); // Complete trade (seller)
  reclaimEscrow(); // Seller claims back on timeout
}
```

#### ContractService

```typescript
class ContractService {
  buildCreateTradeTx(); // Soroban XDR for trade creation
  buildDepositTx(); // Stellar tx for USDC deposit + contract call
  buildReleaseTx(); // Soroban XDR for fund release
  buildReclaimTx(); // Soroban XDR for timeout reclaim
  simulateTransaction(); // Dry-run on Soroban to validate
  submitTransaction(); // Submit to Stellar with retry + metrics
}
```

#### DisputeService

```typescript
class DisputeService {
  initiateDispute(); // Create dispute within time window
  resolveDispute(); // Arbitrator resolution
  listDisputes(); // Paginated dispute list
  getDisputeStatus(); // Current resolution status
}
```

#### EventListenerService (Background)

```typescript
class EventListenerService {
  start(); // Poll Soroban RPC for contract events
  processTradeCreated(); // Handle TRADE_CREATED event
  processDepositConfirmed(); // Handle DEPOSIT_CONFIRMED event
  processEscrowReleased(); // Handle ESCROW_RELEASED event
  // Runs every EVENT_POLL_INTERVAL_MS (default 10s)
}
```

### 3. **Data Access Layer**

**Primary ORM:** Prisma (PostgreSQL)

- Manages trade, dispute, evidence, audit trail tables
- Schema supports multi-ledger state (pending, funded, settled)

**Secondary Caches:**

- Redis: Rate limit counters, session tokens, ephemeral state
- In-memory: Processed ledger cache for idempotency

**Immutable Audit Trail:**

- Every state change signed with Ed25519 key
- Stored in `AuditTrailEntry` table with `signature` column

### 4. **External Services**

| Service                 | Purpose                             | Criticality | Fallback                                          |
| ----------------------- | ----------------------------------- | ----------- | ------------------------------------------------- |
| **Stellar/Soroban RPC** | Transaction submission + simulation | Critical    | Retry with exponential backoff (5 attempts max)   |
| **PostgreSQL**          | Persistent state (trades, disputes) | Critical    | Health check on connection pool                   |
| **Redis**               | Rate limiting + sessions            | Medium      | Fall back to in-memory store; clear rate limits   |
| **Pinata/IPFS**         | Proof-of-delivery video storage     | Medium      | Circuit breaker; return 503 on persistent failure |
| **Supabase**            | Off-chain metadata + auth           | Low         | Optional; trade proceeds without metadata         |

---

## Data Flow

### Trade Creation Flow

```
1. Client (POST /trades with createTradeSchema)
   │
   ├─ Validate JWT + extract walletAddress
   │
   ├─ Zod parse request body
   │   ├─ Validate Stellar addresses
   │   ├─ Validate amount (0-7 decimals)
   │   └─ Ensure buyerLossBps + sellerLossBps = 10000
   │
   ├─ TradeService.createPendingTrade()
   │   │
   │   ├─ Generate tradeId (UUID)
   │   │
   │   ├─ Prisma.trade.create()
   │   │   └─ INSERT into database with status=PENDING_SIGNATURE
   │   │
   │   ├─ Record audit trail entry
   │   │   └─ Action: "TRADE_CREATED"
   │   │   └─ Sign with AUDIT_SIGNING_PRIVATE_KEY_PEM
   │   │
   │   └─ TracingHelper.addEvent("authorization_started")
   │
   └─ Response (201 Created)
       └─ Return trade object + tradeId for next steps
```

**Database State After:**

```
trades table:
  id: "uuid-123"
  status: "PENDING_SIGNATURE"
  buyerAddress: "G..."
  sellerAddress: "G..."
  amountUsdc: "1000.50"
  createdAt: 2026-06-24T10:30:00Z

auditTrailEntries table:
  action: "TRADE_CREATED"
  actor: "G..." (authenticated user)
  signature: "base64-ed25519-sig"
```

### Deposit & Funding Flow

```
1. Client (POST /trades/:id/deposit)
   │
   ├─ Validate trade exists + buyer is caller
   │
   ├─ ContractService.buildDepositTx()
   │   │
   │   ├─ Get AMANA_ESCROW_CONTRACT_ID from env
   │   │
   │   ├─ Fetch buyer's account from Stellar
   │   │   └─ Use Soroban RPC or Horizon
   │   │
   │   ├─ Build contract invocation XDR
   │   │   ├─ Function: "create_escrow"
   │   │   ├─ Args: [tradeId, seller, buyerLoss, sellerLoss]
   │   │   └─ Auth framework for multi-sig
   │   │
   │   └─ Return unsigned transaction XDR
   │
   ├─ Response (200 OK)
   │   └─ { transactionXdr, hash, memo }
   │
   └─ Client signs with Freighter/TrustWallet → submits to network
      │
      └─ Network broadcasts to validators
         └─ Soroban validates contract logic
            │
            ├─ Transfer USDC from buyer to escrow contract
            │
            ├─ Update ledger entry with escrow state
            │
            └─ Emit DEPOSIT_CONFIRMED event
               │
               └─ EventListenerService polls Soroban RPC
                  │
                  ├─ Detects DEPOSIT_CONFIRMED event
                  │
                  ├─ Prisma.trade.update()
                  │   └─ status: PENDING_DEPOSIT → FUNDED
                  │
                  ├─ Record audit trail
                  │
                  └─ Webhook to client (if configured)
```

**Blockchain State (Soroban Contract):**

```rust
#[derive(Serialize)]
pub struct EscrowState {
    pub trade_id: String,
    pub buyer: Address,
    pub seller: Address,
    pub amount: i128,  // Stroops (1 USDC = 10,000,000 stroops)
    pub buyer_loss_bps: u32,
    pub seller_loss_bps: u32,
    pub status: EscrowStatus,  // Active, Released, Reclaimed
}
```

### Delivery Confirmation Flow (PoD)

```
1. Buyer records proof-of-delivery video
   │
   ├─ POST /trades/:id/manifest
   │   │
   │   ├─ multipart/form-data: [video file, metadata JSON]
   │   │
   │   ├─ ManifestService.uploadToIpfs()
   │   │   │
   │   │   ├─ Validate video (max 500MB)
   │   │   │
   │   │   ├─ POST to Pinata API
   │   │   │   └─ Pinata adds to IPFS + pins
   │   │   │
   │   │   ├─ Retry 3x on failure (429, 5xx)
   │   │   │
   │   │   ├─ Circuit breaker trips after 3 failures in 30s
   │   │   │   └─ Return 503 Service Unavailable
   │   │   │
   │   │   └─ Return IPFS CID (content hash)
   │   │
   │   ├─ Prisma.manifest.create()
   │   │   └─ Store CID, metadata, uploader
   │   │
   │   └─ Response (201 Created)
   │       └─ { cid: "QmXXX...", status: "uploaded" }
   │
   ├─ Buyer calls POST /trades/:id/confirm
   │   │
   │   ├─ TradeService.confirmDelivery()
   │   │   │
   │   │   ├─ Verify buyer role
   │   │   │
   │   │   ├─ Prisma.trade.update()
   │   │   │   └─ status: FUNDED → DELIVERED
   │   │   │
   │   │   └─ Record audit trail
   │   │
   │   └─ Response (200 OK)
   │       └─ { status: "DELIVERED" }
   │
   └─ Seller receives notification via webhook/polling
      │
      └─ Seller calls POST /trades/:id/release
         │
         ├─ ContractService.buildReleaseTx()
         │   │
         │   ├─ Build Soroban XDR for "release_escrow"
         │   │
         │   └─ Return unsigned transaction
         │
         ├─ Client signs + submits
         │
         └─ Soroban contract:
            ├─ Transfer USDC to seller
            ├─ Apply 1% platform fee
            ├─ Burn or return remaining collateral
            └─ Emit ESCROW_RELEASED event
```

### Dispute Flow

```
1. Either party initiates dispute within 48 hours
   │
   ├─ POST /trades/:id/dispute
   │   │
   │   ├─ Rate limit: 5/hour per wallet
   │   │
   │   ├─ Validate reason (min 10 chars)
   │   │
   │   ├─ Validate category or categoryId provided
   │   │
   │   ├─ DisputeService.initiateDispute()
   │   │   │
   │   │   ├─ Verify trade in FUNDED or DELIVERED status
   │   │   │
   │   │   ├─ Prisma.dispute.create()
   │   │   │   └─ status: OPEN
   │   │   │
   │   │   ├─ Prisma.trade.update()
   │   │   │   └─ status: DISPUTED
   │   │   │
   │   │   └─ Record audit trail
   │   │
   │   └─ Response (201 Created)
   │       └─ { id: "dispute-uuid" }
   │
   └─ Webhook alerts arbitrators
      │
      ├─ Arbitrator reviews evidence
      ├─ Arbitrator calls resolve endpoint
      └─ Funds distributed per settlement
```

---

## Stellar Testnet Configuration

### Network Settings

**Environment Variables:**

```bash
STELLAR_NETWORK=testnet              # or "mainnet"
STELLAR_NETWORK_PASSPHRASE=          # Auto-detected if empty
STELLAR_RPC_URL=https://soroban-testnet.stellar.org
AMANA_ESCROW_CONTRACT_ID=CAA...      # Deployed contract address
USDC_CONTRACT_ID=CBA...              # USDC token contract
```

### Testnet Assumptions

1. **Asset Issuer (USDC)**
   - Mainnet: `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`
   - Testnet: `GDDD3FRCH55BSYNKISYY242HQNIBOH35CQP42NSJABR62XK2JOV5MED6` (configurable)

2. **Soroban RPC Capabilities (v21.0+)**
   - `getAccount()` - Fetch account details + sequence number
   - `prepareTransaction()` - Pre-flight checks
   - `simulateTransaction()` - Dry-run with resource estimation
   - `sendTransaction()` - Submit + wait for inclusion
   - `getTransactionStatus()` - Check result after submission
   - `getLedgerEntries()` - Query contract state
   - `getEvents()` - Query contract events (with filters)

3. **Event Polling**
   - Polls Soroban RPC every `EVENT_POLL_INTERVAL_MS` (default 10 seconds)
   - Maintains `PROCESSED_LEDGERS_CACHE_SIZE` (default 10,000) to avoid reprocessing
   - Backoff on network errors: initial 1s, max 30s (exponential)
   - Retry up to `EVENT_OUTBOX_MAX_ATTEMPTS` times (default 5)

4. **Network Characteristics**
   - Average block time: ~5-10 seconds
   - Finality: Immediate (single-layer consensus)
   - Fee model: Base 100 stroops + 200 stroops per operation
   - Max transaction size: ~100KB (after XDR encoding)

5. **Contract Assumptions**
   - **Write Access Control:** Only admin keys (via `ADMIN_STELLAR_PUBKEYS`) can:
     - Update contract state
     - Release collateral
     - Emergency pause
   - **Read Access:** Public (any caller can query escrow state)
   - **Multi-sig Support:** Contract validates signatures via Soroban auth framework

### Development Testnet Workflow

```bash
# 1. Generate test keypair
stellar keys generate --network testnet
# Output: Public Key: GXXXXXX..., Secret: SBXXXXX...

# 2. Fund account from faucet
# Visit: https://laboratory.stellar.org/#account-creator?network=testnet
# Enter public key, request test XLM

# 3. Deploy contract (via soroban CLI)
soroban contract deploy \
  --wasm amana_escrow.wasm \
  --network testnet \
  --source <keypair>

# 4. Set contract address in .env.staging
AMANA_ESCROW_CONTRACT_ID=<contract-address>

# 5. Start event listener
npm run dev

# 6. Create test trade via API
curl -X POST http://localhost:4000/trades \
  -H "Authorization: Bearer $JWT" \
  -d '{"sellerAddress":"G...", ...}'
```

### Key Testnet Considerations

1. **Account Sequence Numbers**
   - Each successful transaction increments sequence
   - Concurrent requests must obtain fresh sequence before submitting
   - Use Stellar SDK's `SequenceNumber` auto-increment

2. **Fee Estimation**
   - Base fee: 100 stroops
   - Use `prepareTransaction()` to estimate resource fees
   - Add 10% buffer for safety

3. **Contract State Persistence**
   - Testnet state persists across deployment cycles
   - Reset via contract's `initialize()` if idempotent
   - Or redeploy fresh contract

4. **Event Retention**
   - Soroban RPC retains events for ~1 week
   - Archive to off-chain storage (Supabase) for long-term queries

---

## Middleware Pipeline & Error Handling

### Request Processing

```
Express Request
  ↓
[1] correlationIdMiddleware
    ├─ Attach x-correlation-id (from header or generate)
    ├─ Attach x-request-id (always generate)
    └─ Echo back in response headers
  ↓
[2] tracingMiddleware
    ├─ Create OpenTelemetry span
    ├─ Link correlation ID to span
    └─ Record HTTP attributes
  ↓
[3] loggerMiddleware
    ├─ Pino JSON logger
    └─ Include correlation/request IDs in every log
  ↓
[4] authMiddleware (selective routes)
    ├─ Extract JWT from Authorization header
    ├─ Verify signature + expiration
    └─ Attach req.user with wallet address
  ↓
[5] validateRequest (selective routes)
    ├─ Zod schema validation
    └─ Return 400 with detailed errors if invalid
  ↓
[6] Route Handler / Service
    ├─ Business logic
    └─ May throw custom errors
  ↓
Error Handler Middleware
    ├─ Catch all errors
    ├─ Format as JSON
    ├─ Include correlation ID
    └─ Set appropriate HTTP status
  ↓
Response
```

### Error Categories

| Category                | HTTP Status | Example                                     |
| ----------------------- | ----------- | ------------------------------------------- |
| **Validation**          | 400         | Invalid amount format, missing field        |
| **Authentication**      | 401         | Expired JWT, invalid signature              |
| **Authorization**       | 403         | User is not trade participant               |
| **Not Found**           | 404         | Trade ID does not exist                     |
| **Conflict**            | 409         | Trade already in FUNDED state               |
| **Rate Limited**        | 429         | Too many disputes this hour                 |
| **Server Error**        | 500         | Unexpected exception                        |
| **Service Unavailable** | 503         | Stellar RPC down, IPFS circuit breaker open |

### Custom Error Classes

```typescript
class TradeAccessDeniedError extends Error {} // 403
class TradeNotFoundError extends Error {} // 404
class DisputeTradeStatusError extends Error {} // 400
class DisputeCategoryValidationError extends Error {} // 400
class ContractSimulationError extends Error {} // 502
class IpfsCircuitBreakerOpenError extends Error {} // 503
```

---

## Observability & Tracing

### Logging Strategy

All logs are **structured JSON** via Pino:

```json
{
  "level": 30,
  "time": "2026-06-24T10:30:00.123Z",
  "req": {
    "id": "x-request-id",
    "method": "POST",
    "url": "/trades",
    "headers": {...}
  },
  "res": {
    "statusCode": 201,
    "responseTime": 145
  },
  "correlation_id": "x-correlation-id",
  "userId": "walletAddress",
  "msg": "POST /trades"
}
```

### Tracing (OpenTelemetry)

Traces are exported to:

- **Jaeger** (if `JAEGER_ENDPOINT` set)
- **Zipkin** (if `ZIPKIN_ENDPOINT` set)
- **Prometheus** (if `PROMETHEUS_PORT` set)

**Trace Structure:**

```
Trace ID: correlation-id
├─ HTTP Span (POST /trades)
│  ├─ db.query Span (Prisma.trade.create)
│  ├─ db.query Span (Prisma.auditTrail.create)
│  └─ http.request Span (Stellar RPC call, if needed)
└─ Response: 201 Created
```

---

## Database Schema (Prisma)

Key tables:

```typescript
model Trade {
  id                String @id @default(cuid())
  buyerAddress      String
  sellerAddress     String
  amountUsdc        Decimal
  buyerLossBps      Int
  sellerLossBps     Int
  status            TradeStatus
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  disputes          Dispute[]
  auditTrail        AuditTrailEntry[]
  manifest          Manifest?
}

model Dispute {
  id                String @id @default(cuid())
  tradeId           String @unique
  trade             Trade @relation(fields: [tradeId])
  initiatedBy       String
  reason            String
  category          String?
  categoryId        Int?
  status            DisputeStatus
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}

model AuditTrailEntry {
  id                String @id @default(cuid())
  tradeId           String
  trade             Trade @relation(fields: [tradeId])
  action            String
  actor             String
  changes           Json   // { before, after }
  signature         String // Ed25519 signature
  timestamp         DateTime @default(now())
}

model Manifest {
  id                String @id @default(cuid())
  tradeId           String @unique
  trade             Trade @relation(fields: [tradeId])
  cid               String // IPFS content identifier
  metadata          Json
  uploadedAt        DateTime @default(now())
}
```

---

## Performance & Scaling

### Rate Limiting

Per-wallet limits (stored in Redis):

| Endpoint       | Window | Limit | Strategy                  |
| -------------- | ------ | ----- | ------------------------- |
| Login          | 15 min | 10    | Distributed, Redis-backed |
| Trade creation | 1 min  | 30    | Per-user                  |
| Disputes       | 1 hour | 5     | Per-user                  |

### Caching

- **Trade List Queries:** Cached for 30s per user
- **Contract State:** Cached for 5s (stale-while-revalidate)
- **Event Ledger Positions:** Maintained in memory (10k ledgers)

### Connection Pooling

- **PostgreSQL:** 10 connections min, 20 max
- **Redis:** Single connection (ioredis handles reconnect)
- **Stellar RPC:** 5 concurrent requests max (queue excess)

---

## Deployment

### Environment Variables (Staging)

See `.env.staging.example` for full list. Key ones:

```bash
NODE_ENV=staging
DATABASE_URL=postgresql://user:pwd@postgres.staging:5432/amana
REDIS_URL=redis://redis.staging:6379/0
JWT_SECRET=<32-char-minimum>
STELLAR_NETWORK=testnet
JAEGER_ENDPOINT=http://jaeger.staging:14268/api/traces
```

### Docker Deployment

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
EXPOSE 4000
CMD ["node", "dist/index.js"]
```

---

## Debugging Tips

1. **Find logs by correlation ID:**

   ```bash
   grep "correlation_id=<id>" logs/amana-backend.log | jq .
   ```

2. **Check Stellar transaction status:**

   ```typescript
   const result = await sorobanRpcClient.getTransaction(txHash);
   console.log(result.status); // "SUCCESS" | "FAILED" | "NOT_FOUND"
   ```

3. **Verify contract state:**

   ```typescript
   const entries = await sorobanRpcClient.getLedgerEntries(contractId, key);
   ```

4. **Monitor event listener:**
   - Check `EVENT_POLL_INTERVAL_MS` lag
   - Verify no backoff in progress
   - Check `PROCESSED_LEDGERS_CACHE_SIZE` not exceeded

---

## References

- Stellar Docs: https://developers.stellar.org
- Soroban Docs: https://soroban.stellar.org
- Prisma ORM: https://www.prisma.io
- OpenTelemetry: https://opentelemetry.io
- Pino Logger: https://getpino.io
