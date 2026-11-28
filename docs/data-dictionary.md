# Database Data Dictionary

This document describes all tables in the Supabase database schema, including columns, types, foreign keys, indexes, and RLS policies.

## Tables

### User

Represents a user in the system, identified by their Stellar wallet address.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | SERIAL | No | Primary key |
| walletAddress | VARCHAR(255) | No | Stellar wallet address (unique) |
| displayName | VARCHAR(255) | No | User's display name |
| createdAt | TIMESTAMP(3) | No | Creation timestamp |
| updatedAt | TIMESTAMP(3) | No | Last update timestamp |

**Indexes:**
- `User_walletAddress_key` (UNIQUE)
- `User_walletAddress_idx`

**Foreign Keys:** None

**RLS Policies:** Public read/write for authenticated users

---

### Trade

Core escrow trade entity. Stores trade details, status, and financial terms.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | SERIAL | No | Primary key |
| tradeId | VARCHAR(255) | No | Unique trade identifier (on-chain) |
| buyerAddress | VARCHAR(255) | No | Buyer's wallet address |
| sellerAddress | VARCHAR(255) | No | Seller's wallet address |
| amount | DECIMAL(20,7) | No | Trade amount (asset-agnostic) |
| assetCode | TEXT | No | Asset code (e.g., "cNGN") |
| amountUsdc | VARCHAR(100) | No | Legacy USDC-equivalent amount (deprecated) |
| status | TradeStatus | No | Current trade state |
| buyerLossBps | INTEGER | No | Buyer's loss share in basis points (default 5000 = 50%) |
| sellerLossBps | INTEGER | No | Seller's loss share in basis points (default 5000 = 50%) |
| createdAt | TIMESTAMP(3) | No | Creation timestamp |
| updatedAt | TIMESTAMP(3) | No | Last update timestamp |

**Indexes:**
- `Trade_tradeId_key` (UNIQUE)
- `Trade_tradeId_idx`
- `Trade_buyerAddress_idx`
- `Trade_sellerAddress_idx`
- `Trade_status_idx`

**Foreign Keys:**
- `Trade_buyerAddress_fkey` → User(walletAddress)
- `Trade_sellerAddress_fkey` → User(walletAddress)

**RLS Policies:** Authenticated users can read their own trades; write via API

---

### Dispute

Dispute records created when buyers or sellers raise issues with a trade.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | SERIAL | No | Primary key |
| tradeId | VARCHAR(255) | No | Reference to trade |
| initiator | VARCHAR(255) | No | Wallet address of dispute initiator |
| reason | TEXT | No | Dispute description |
| status | DisputeStatus | No | Current dispute state |
| categoryId | INTEGER | Yes | Reference to DisputeCategory |
| version | INTEGER | No | Optimistic locking version |
| resolvedAt | TIMESTAMP(3) | Yes | Resolution timestamp |
| createdAt | TIMESTAMP(3) | No | Creation timestamp |
| updatedAt | TIMESTAMP(3) | No | Last update timestamp |

**Indexes:**
- `Dispute_tradeId_key` (UNIQUE)
- `Dispute_tradeId_idx`
- `Dispute_initiator_idx`
- `Dispute_status_idx`
- `Dispute_categoryId_idx`

**Foreign Keys:**
- `Dispute_tradeId_fkey` → Trade(tradeId)
- `Dispute_initiator_fkey` → User(walletAddress)
- `Dispute_categoryId_fkey` → DisputeCategory(id)

**RLS Policies:** Trade parties and mediators can read/write

---

### DisputeCategory

Categories for classifying disputes (e.g., DAMAGE, DELIVERY_DELAY, PAYMENT).

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | SERIAL | No | Primary key |
| name | VARCHAR(100) | No | Category name (unique) |
| description | TEXT | Yes | Category description |
| isActive | BOOLEAN | No | Whether category is active |
| createdAt | TIMESTAMP(3) | No | Creation timestamp |
| updatedAt | TIMESTAMP(3) | No | Last update timestamp |

**Indexes:**
- `DisputeCategory_name_key` (UNIQUE)
- `DisputeCategory_name_idx`
- `DisputeCategory_isActive_idx`

**RLS Policies:** Read-only for regular users; admin write

---

### DeliveryManifest

Driver and vehicle details for trade delivery.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | SERIAL | No | Primary key |
| tradeId | VARCHAR(255) | No | Reference to trade |
| driverName | VARCHAR(255) | No | Driver's full name |
| driverIdNumber | VARCHAR(255) | No | Driver's ID number |
| vehicleRegistration | VARCHAR(100) | No | Vehicle plate number |
| routeDescription | TEXT | No | Delivery route description |
| expectedDeliveryAt | TIMESTAMP(3) | No | Expected delivery time |
| driverNameHash | VARCHAR(64) | No | SHA-256 hash of driver name |
| driverIdHash | VARCHAR(64) | No | SHA-256 hash of driver ID |
| createdAt | TIMESTAMP(3) | No | Creation timestamp |

**Indexes:**
- `DeliveryManifest_tradeId_key` (UNIQUE)
- `DeliveryManifest_tradeId_idx`

**Foreign Keys:** `DeliveryManifest_tradeId_fkey` → Trade(tradeId)

**RLS Policies:** Trade parties and driver can read/write

---

### TradeEvidence

IPFS-stored evidence (videos, documents) for trades.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | SERIAL | No | Primary key |
| tradeId | VARCHAR(255) | No | Reference to trade |
| cid | VARCHAR(255) | No | IPFS content identifier |
| filename | VARCHAR(255) | No | Original filename |
| mimeType | VARCHAR(100) | No | MIME type of evidence |
| uploadedBy | VARCHAR(255) | No | Uploader's wallet address |
| createdAt | TIMESTAMP(3) | No | Creation timestamp |

**Indexes:**
- `TradeEvidence_tradeId_idx`
- `TradeEvidence_cid_idx`

**Foreign Keys:** `TradeEvidence_tradeId_fkey` → Trade(tradeId)

**RLS Policies:** Trade parties and mediators can read/write

---

### Vault

User's escrow vault for holding funds.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | SERIAL | No | Primary key |
| vaultId | VARCHAR(255) | No | Unique vault identifier |
| ownerAddress | VARCHAR(255) | No | Vault owner's wallet address |
| balanceUsdc | VARCHAR(100) | No | Vault balance (deprecated, use amount) |
| createdAt | TIMESTAMP(3) | No | Creation timestamp |
| updatedAt | TIMESTAMP(3) | No | Last update timestamp |

**Indexes:**
- `Vault_vaultId_key` (UNIQUE)
- `Vault_vaultId_idx`
- `Vault_ownerAddress_idx`

**Foreign Keys:** `Vault_ownerAddress_fkey` → User(walletAddress)

**RLS Policies:** Vault owner full access

---

### Goal

Savings goal associated with a vault.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | SERIAL | No | Primary key |
| goalId | VARCHAR(255) | No | Unique goal identifier |
| vaultId | VARCHAR(255) | No | Reference to vault |
| userId | INTEGER | No | Reference to user |
| targetAmountUsdc | VARCHAR(100) | No | Target savings amount |
| currentAmountUsdc | VARCHAR(100) | No | Current saved amount |
| deadline | TIMESTAMP(3) | No | Goal deadline |
| status | GoalStatus | No | Current goal state |
| createdAt | TIMESTAMP(3) | No | Creation timestamp |
| updatedAt | TIMESTAMP(3) | No | Last update timestamp |

**Indexes:**
- `Goal_goalId_key` (UNIQUE)
- `Goal_goalId_idx`
- `Goal_vaultId_idx`
- `Goal_userId_idx`
- `Goal_status_idx`

**Foreign Keys:**
- `Goal_vaultId_fkey` → Vault(vaultId)
- `Goal_userId_fkey` → User(id)

**RLS Policies:** Goal owner full access

---

### ProcessedEvent

Tracks processed Stellar chain events to prevent duplicate processing.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | SERIAL | No | Primary key |
| ledgerSequence | INTEGER | No | Stellar ledger sequence |
| contractId | VARCHAR(255) | No | Smart contract ID |
| eventId | VARCHAR(255) | No | Unique event identifier |
| processedAt | TIMESTAMP(3) | No | Processing timestamp |

**Indexes:**
- `ProcessedEvent_ledgerSequence_contractId_eventId_key` (UNIQUE)
- `ProcessedEvent_ledgerSequence_idx`

**RLS Policies:** System-only write

---

### ChainEventOutbox

Outbox table for reliable chain event processing with retry logic.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | SERIAL | No | Primary key |
| ledgerSequence | INTEGER | No | Stellar ledger sequence |
| contractId | VARCHAR(255) | No | Smart contract ID |
| eventId | VARCHAR(255) | No | Unique event identifier |
| eventType | VARCHAR(100) | No | Type of event |
| tradeId | VARCHAR(255) | No | Related trade ID |
| payload | JSONB | No | Event payload data |
| status | ChainEventSyncStatus | No | Processing status |
| attempts | INTEGER | No | Number of processing attempts |
| nextAttemptAt | TIMESTAMP(3) | No | Next retry time |
| lastError | TEXT | Yes | Last error message |
| deadLetteredAt | TIMESTAMP(3) | Yes | When moved to dead letter |
| processedAt | TIMESTAMP(3) | Yes | Processing completion time |
| createdAt | TIMESTAMP(3) | No | Creation timestamp |
| updatedAt | TIMESTAMP(3) | No | Last update timestamp |

**Indexes:**
- `ChainEventOutbox_ledgerSequence_contractId_eventId_key` (UNIQUE)
- `ChainEventOutbox_status_nextAttemptAt_idx`
- `ChainEventOutbox_ledgerSequence_idx`

**RLS Policies:** System-only write

---

### RefreshToken

JWT refresh tokens for session management.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | SERIAL | No | Primary key |
| tokenHash | VARCHAR(255) | No | SHA-256 hash of refresh token |
| userId | INTEGER | No | Reference to user |
| expiresAt | TIMESTAMP(3) | No | Token expiration time |
| createdAt | TIMESTAMP(3) | No | Creation timestamp |

**Indexes:**
- `RefreshToken_tokenHash_key` (UNIQUE)
- `RefreshToken_tokenHash_idx`

**Foreign Keys:** `RefreshToken_userId_fkey` → User(id)

**RLS Policies:** User can read/write own tokens

---

### WebhookSubscription

User-configured webhooks for trade event notifications.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | SERIAL | No | Primary key |
| url | VARCHAR(500) | No | Webhook endpoint URL |
| events | TEXT[] | No | List of subscribed events |
| secretHash | VARCHAR(64) | No | HMAC secret for verification |
| isActive | BOOLEAN | No | Whether webhook is active |
| userId | INTEGER | No | Reference to user |
| createdAt | TIMESTAMP(3) | No | Creation timestamp |
| updatedAt | TIMESTAMP(3) | No | Last update timestamp |

**Indexes:**
- `WebhookSubscription_userId_idx`
- `WebhookSubscription_isActive_idx`

**Foreign Keys:** `WebhookSubscription_userId_fkey` → User(id)

**RLS Policies:** User owns their webhooks

---

### TradeTemplate

Reusable trade term templates for a user.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | SERIAL | No | Primary key |
| userAddress | VARCHAR(255) | No | Owner's wallet address |
| name | VARCHAR(100) | No | Template name |
| sellerAddress | VARCHAR(255) | No | Default seller address |
| amountUsdc | VARCHAR(100) | No | Default amount |
| buyerLossBps | INTEGER | No | Default buyer loss ratio |
| sellerLossBps | INTEGER | No | Default seller loss ratio |
| createdAt | TIMESTAMP(3) | No | Creation timestamp |
| updatedAt | TIMESTAMP(3) | No | Last update timestamp |

**Indexes:**
- `TradeTemplate_userAddress_name_key` (UNIQUE)
- `TradeTemplate_userAddress_createdAt_idx`

**Foreign Keys:** `TradeTemplate_userAddress_fkey` → User(walletAddress)

**RLS Policies:** Template owner full access

---

### UserWatchlist

Bookmarked trades for a user's dashboard.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | SERIAL | No | Primary key |
| userAddress | VARCHAR(255) | No | Owner's wallet address |
| tradeId | VARCHAR(255) | No | Bookmarked trade ID |
| createdAt | TIMESTAMP(3) | No | Creation timestamp |

**Indexes:**
- `UserWatchlist_userAddress_tradeId_key` (UNIQUE)
- `UserWatchlist_userAddress_createdAt_idx`
- `UserWatchlist_tradeId_idx`

**Foreign Keys:**
- `UserWatchlist_userAddress_fkey` → User(walletAddress)
- `UserWatchlist_tradeId_fkey` → Trade(tradeId)

**RLS Policies:** User owns their watchlist

---

### AdminActionAudit

Audit trail for admin-initiated actions.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | SERIAL | No | Primary key |
| action | VARCHAR(64) | No | Action type (e.g., TREASURY_WITHDRAWAL) |
| actorAddress | VARCHAR(255) | No | Admin's wallet address |
| targetReference | VARCHAR(255) | Yes | Target of the action |
| note | TEXT | Yes | Optional admin note |
| createdAt | TIMESTAMP(3) | No | Action timestamp |

**Indexes:**
- `AdminActionAudit_action_createdAt_idx`
- `AdminActionAudit_actorAddress_idx`

**RLS Policies:** Admin read; system write

---

### EscrowAudit

Audit trail for escrow state transitions.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | SERIAL | No | Primary key |
| tradeId | VARCHAR(255) | No | Reference to trade |
| eventType | VARCHAR(100) | No | Event type |
| fromStatus | VARCHAR(50) | Yes | Previous status |
| toStatus | VARCHAR(50) | No | New status |
| actor | VARCHAR(255) | Yes | Actor's wallet address |
| contractId | VARCHAR(255) | Yes | Smart contract ID |
| ledgerSequence | INTEGER | Yes | Stellar ledger number |
| extra | JSONB | Yes | Additional event data |
| createdAt | TIMESTAMP(3) | No | Event timestamp |

**Indexes:**
- `EscrowAudit_tradeId_idx`
- `EscrowAudit_tradeId_createdAt_idx`
- `EscrowAudit_eventType_idx`

**RLS Policies:** System write; admin read

---

### Stream (if exists)

Payment streaming configuration.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | SERIAL | No | Primary key |
| streamId | VARCHAR(255) | No | Unique stream identifier |
| senderAddress | VARCHAR(255) | No | Sender's wallet |
| recipientAddress | VARCHAR(255) | No | Recipient's wallet |
| amountPerSecond | VARCHAR(100) | No | Streaming rate |
| startTime | TIMESTAMP(3) | No | Stream start |
| endTime | TIMESTAMP(3) | No | Stream end |
| status | StreamStatus | No | Stream lifecycle state |
| lockedAt | TIMESTAMP(3) | Yes | Admin lock timestamp |
| lockedBy | VARCHAR(255) | Yes | Admin who locked |
| lockReason | TEXT | Yes | Lock reason |
| terminatedAt | TIMESTAMP(3) | Yes | Termination timestamp |
| terminatedBy | VARCHAR(255) | Yes | Terminator's address |
| terminationReason | TEXT | Yes | Termination reason |
| createdAt | TIMESTAMP(3) | No | Creation timestamp |
| updatedAt | TIMESTAMP(3) | No | Last update timestamp |

**Indexes:**
- `Stream_streamId_key` (UNIQUE)
- `Stream_senderAddress_idx`
- `Stream_recipientAddress_idx`
- `Stream_status_idx`

**Foreign Keys:**
- `Stream_senderAddress_fkey` → User(walletAddress)
- `Stream_recipientAddress_fkey` → User(walletAddress)

**RLS Policies:** Parties and admin

---

## Enums

### TradeStatus
- `CREATED` - Trade initiated
- `PENDING_SIGNATURE` - Awaiting on-chain signature
- `FUNDED` - Funds locked in escrow
- `DELIVERED` - Goods delivered
- `COMPLETED` - Trade settled successfully
- `DISPUTED` - Under dispute
- `CANCELLED` - Trade cancelled

### DisputeStatus
- `OPEN` - Dispute raised
- `UNDER_REVIEW` - Mediator reviewing
- `RESOLVED` - Dispute decided
- `CLOSED` - Dispute archived

### GoalStatus
- `ACTIVE` - Goal in progress
- `COMPLETED` - Target reached
- `CANCELLED` - Goal cancelled

### ChainEventSyncStatus
- `PENDING` - Awaiting processing
- `RETRYING` - Currently retrying
- `PROCESSED` - Successfully processed
- `DEAD_LETTER` - Moved to dead letter queue

### StreamStatus
- `ACTIVE` - Streaming
- `SUSPENDED` - Temporarily paused
- `TERMINATED` - Stopped by admin
- `COMPLETED` - Natural completion

---

## Notes

- **RLS (Row-Level Security)**: All tables have RLS enabled. Policies control access based on wallet address.
- **Checksum fields**: Driver name and ID are stored as SHA-256 hashes for privacy (driverNameHash, driverIdHash).
- **Deprecated fields**: `amountUsdc` in Trade and Vault is deprecated in favor of asset-agnostic `amount` and `assetCode`.
- **Audit fields**: Admin and escrow actions are audited with trace IDs for distributed tracing integration.

Generated from Prisma migrations. Last updated: 2026-11-25.