# NEUROWEALTH_API Contract Documentation

## Overview

The Amana backend exposes a RESTful API for managing escrow trades, disputes, evidence, and wallet interactions on the Stellar/Soroban network. This document specifies the API contract including endpoints, authentication, request/response formats, and error handling.

## Base URL

```
https://api.amana.com  # Production
http://localhost:4000  # Development
```

## Authentication

### JWT Bearer Token

All protected endpoints require authentication via JWT Bearer tokens.

**Request Header:**

```
Authorization: Bearer <jwt_token>
```

**JWT Structure:**

- **Issuer**: `amana` (configurable via `JWT_ISSUER`)
- **Audience**: `amana-api` (configurable via `JWT_AUDIENCE`)
- **Expiration**: 24 hours by default (configurable via `JWT_EXPIRES_IN`)
- **Secret**: Minimum 32 characters (via `JWT_SECRET`)

**Required Claims:**

```json
{
  "walletAddress": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "iat": 1234567890,
  "exp": 1234567890,
  "iss": "amana",
  "aud": "amana-api"
}
```

### Public Endpoints

- `POST /auth/login` - Obtain JWT token
- `GET /health` - Health check (no auth required)

## Tracing Headers

Every request/response includes distributed tracing headers for cross-service correlation:

```
Request:
  x-correlation-id: <uuid>  (optional; generated if not provided)

Response:
  x-correlation-id: <uuid>  (echoed back)
  x-request-id: <uuid>      (always server-generated)
```

---

## Endpoints

### Trades

#### POST /trades - Create Trade

Create a new pending trade with loss sharing configuration.

**Authentication:** Required

**Request Body:**

```json
{
  "sellerAddress": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "buyerAddress": "GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "amountUsdc": "1000.50",
  "buyerLossBps": 5000,
  "sellerLossBps": 5000,
  "description": "Rice trade 50kg bags"
}
```

**Parameters:**

- `sellerAddress` (string, required): Stellar public key of seller
- `buyerAddress` (string, optional): Stellar public key of buyer (defaults to authenticated user)
- `amountUsdc` (string|number, required): Trade amount in USDC; regex: `^\d+(\.\d{1,7})?$`
- `buyerLossBps` (number, optional): Buyer loss share in basis points (0-10000), default 5000
- `sellerLossBps` (number, optional): Seller loss share in basis points (0-10000), default 5000
- `description` (string, optional): Trade description

**Validation:**

- `buyerLossBps + sellerLossBps` must equal 10000
- Both addresses must be valid Stellar Ed25519 public keys

**Response (201 Created):**

```json
{
  "id": "trade-uuid-123",
  "buyerAddress": "GXXXXXXX...",
  "sellerAddress": "GXXXXXXX...",
  "amountUsdc": "1000.50",
  "buyerLossBps": 5000,
  "sellerLossBps": 5000,
  "status": "PENDING_SIGNATURE",
  "createdAt": "2026-06-24T10:30:00Z",
  "updatedAt": "2026-06-24T10:30:00Z"
}
```

---

#### GET /trades - List User Trades

Retrieve paginated list of trades for the authenticated user (as buyer or seller).

**Authentication:** Required

**Query Parameters:**

```
GET /trades?status=FUNDED&page=1&limit=20&sort=-createdAt
```

- `status` (string, optional): Filter by trade status enum value
  - Valid values: `PENDING_SIGNATURE`, `PENDING_DEPOSIT`, `FUNDED`, `DELIVERED`, `COMPLETED`, `CANCELLED`, `DISPUTED`
- `page` (number, optional, default: 1): Page number (1-indexed)
- `limit` (number, optional, default: 20): Items per page (1-100)
- `sort` (string, optional): Sort field with direction (e.g., `-createdAt`, `amountUsdc`)

**Response (200 OK):**

```json
{
  "data": [
    {
      "id": "trade-uuid-123",
      "buyerAddress": "GXXXXXXX...",
      "sellerAddress": "GXXXXXXX...",
      "amountUsdc": "1000.50",
      "status": "FUNDED",
      "createdAt": "2026-06-24T10:30:00Z",
      "updatedAt": "2026-06-24T10:35:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "totalPages": 3
  }
}
```

---

#### POST /trades/:id/deposit - Build Deposit Transaction

Generate a Stellar transaction for depositing funds into escrow.

**Authentication:** Required

**Path Parameters:**

- `id` (string, required): Trade ID

**Request Body:**

```json
{}
```

**Response (200 OK):**

```json
{
  "transactionXdr": "AAAAAgAAAAC7VVeJ...",
  "hash": "abcd1234...",
  "memo": "trade-uuid-123"
}
```

---

#### POST /trades/:id/confirm - Confirm Delivery

Mark trade as delivered by buyer (proof-of-delivery).

**Authentication:** Required

**Path Parameters:**

- `id` (string, required): Trade ID

**Request Body:**

```json
{
  "proofOfDeliveryUrl": "ipfs://QmXXX...",
  "notes": "Goods received in good condition"
}
```

**Response (200 OK):**

```json
{
  "id": "trade-uuid-123",
  "status": "DELIVERED",
  "updatedAt": "2026-06-24T11:00:00Z"
}
```

---

#### POST /trades/:id/release - Release Funds

Seller releases escrowed funds (completes successful trade).

**Authentication:** Required

**Path Parameters:**

- `id` (string, required): Trade ID

**Request Body:**

```json
{}
```

**Response (200 OK):**

```json
{
  "transactionXdr": "AAAAAgAAAAC7VVeJ...",
  "hash": "abcd1234...",
  "status": "COMPLETED"
}
```

---

#### POST /trades/:id/dispute - Initiate Dispute

Open a dispute for a trade (within 48 hours of completion).

**Authentication:** Required

**Rate Limiting:** 5 disputes per hour per wallet

**Path Parameters:**

- `id` (string, required): Trade ID

**Request Body:**

```json
{
  "reason": "Goods did not match specification; rice quality was poor",
  "category": "product_quality",
  "categoryId": 1
}
```

**Parameters:**

- `reason` (string, required): Dispute reason (min 10 characters)
- `category` (string, optional): Category name for free-form disputes
- `categoryId` (number, optional): Category ID from predefined categories

**Validation:**

- Trade must be in `FUNDED` or `DELIVERED` status
- Either `category` or `categoryId` must be provided
- One dispute per trade maximum

**Response (201 Created):**

```json
{
  "id": "dispute-uuid-456",
  "tradeId": "trade-uuid-123",
  "initiatedBy": "GXXXXXXX...",
  "reason": "Goods did not match specification; rice quality was poor",
  "category": "product_quality",
  "status": "OPEN",
  "createdAt": "2026-06-24T11:15:00Z"
}
```

---

### Manifest

#### POST /trades/:id/manifest - Upload Trade Manifest

Upload proof-of-delivery manifest (video + metadata).

**Authentication:** Required

**Path Parameters:**

- `id` (string, required): Trade ID

**Request Body (multipart/form-data):**

```
manifest (file): Video file (max 500MB)
metadata (JSON): {"timestamp": "2026-06-24T10:30:00Z", "coordinates": {"lat": 6.5244, "lng": 3.3792}}
```

**Response (201 Created):**

```json
{
  "tradeId": "trade-uuid-123",
  "cid": "QmXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "status": "uploaded",
  "metadata": {
    "timestamp": "2026-06-24T10:30:00Z",
    "coordinates": { "lat": 6.5244, "lng": 3.3792 }
  },
  "createdAt": "2026-06-24T10:30:00Z"
}
```

---

### Evidence

#### GET /trades/:id/evidence - Retrieve Evidence

Get all evidence associated with a trade.

**Authentication:** Required

**Path Parameters:**

- `id` (string, required): Trade ID

**Response (200 OK):**

```json
{
  "tradeId": "trade-uuid-123",
  "evidence": [
    {
      "cid": "QmXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      "type": "video",
      "uploadedAt": "2026-06-24T10:30:00Z",
      "uploadedBy": "GXXXXXXX..."
    }
  ]
}
```

---

#### GET /evidence/:cid/stream - Stream Evidence

Stream evidence file by IPFS content identifier.

**Authentication:** Required (optional for public evidence)

**Path Parameters:**

- `cid` (string, required): IPFS content identifier

**Response (200 OK):**

```
Content-Type: video/mp4 (or appropriate media type)
Content-Length: <bytes>
Content-Disposition: attachment; filename="evidence-trade-123.mp4"

[Binary video stream]
```

---

### Audit Trail

#### GET /trades/:id/history - Trade Audit Trail

Retrieve immutable audit trail of all trade state changes.

**Authentication:** Required

**Path Parameters:**

- `id` (string, required): Trade ID

**Query Parameters:**

```
GET /trades/:id/history?limit=50&offset=0&action=STATUS_CHANGE
```

- `limit` (number, optional, default: 50): Max items
- `offset` (number, optional, default: 0): Pagination offset
- `action` (string, optional): Filter by action type

**Response (200 OK):**

```json
{
  "tradeId": "trade-uuid-123",
  "entries": [
    {
      "id": "audit-entry-1",
      "action": "TRADE_CREATED",
      "actor": "GXXXXXXX...",
      "changes": {
        "before": null,
        "after": { "status": "PENDING_SIGNATURE" }
      },
      "timestamp": "2026-06-24T10:30:00Z",
      "signature": "base64-ed25519-signature"
    },
    {
      "id": "audit-entry-2",
      "action": "DEPOSIT_CONFIRMED",
      "actor": "GXXXXXXX...",
      "changes": {
        "before": { "status": "PENDING_DEPOSIT" },
        "after": { "status": "FUNDED" }
      },
      "timestamp": "2026-06-24T10:35:00Z",
      "signature": "base64-ed25519-signature"
    }
  ],
  "pagination": {
    "offset": 0,
    "limit": 50,
    "total": 5
  }
}
```

---

### Disputes

#### GET /disputes - List Disputes

Retrieve disputes for the authenticated user.

**Authentication:** Required

**Query Parameters:**

```
GET /disputes?status=OPEN&page=1&limit=20
```

- `status` (string, optional): Filter by status (OPEN, PENDING_RESOLUTION, RESOLVED, DISMISSED)
- `page` (number, optional): Page number
- `limit` (number, optional): Items per page

**Response (200 OK):**

```json
{
  "data": [
    {
      "id": "dispute-uuid-456",
      "tradeId": "trade-uuid-123",
      "initiatedBy": "GXXXXXXX...",
      "reason": "Goods did not match specification",
      "category": "product_quality",
      "status": "OPEN",
      "createdAt": "2026-06-24T11:15:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 3
  }
}
```

---

#### GET /dispute-categories - List Dispute Categories

Retrieve predefined dispute categories.

**Authentication:** Optional

**Response (200 OK):**

```json
{
  "categories": [
    {
      "id": 1,
      "name": "product_quality",
      "description": "Product does not meet specified quality standards"
    },
    {
      "id": 2,
      "name": "delivery_delay",
      "description": "Delivery was delayed beyond agreed timeframe"
    },
    {
      "id": 3,
      "name": "quantity_mismatch",
      "description": "Delivered quantity does not match order"
    },
    {
      "id": 4,
      "name": "damage",
      "description": "Product was damaged during delivery"
    }
  ]
}
```

---

## Error Response Format

All errors follow a consistent JSON schema:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "statusCode": 400,
    "correlationId": "12345678-1234-5678-1234-567812345678",
    "requestId": "87654321-4321-8765-4321-876543218765",
    "details": [
      {
        "field": "amountUsdc",
        "issue": "Invalid amount format",
        "value": "abc.xyz"
      }
    ],
    "timestamp": "2026-06-24T10:30:00Z"
  }
}
```

### Error Codes

| Code                    | HTTP Status | Description                                                 |
| ----------------------- | ----------- | ----------------------------------------------------------- |
| `VALIDATION_ERROR`      | 400         | Request validation failed                                   |
| `UNAUTHORIZED`          | 401         | Missing or invalid authentication                           |
| `FORBIDDEN`             | 403         | User lacks permission for this resource                     |
| `NOT_FOUND`             | 404         | Resource does not exist                                     |
| `CONFLICT`              | 409         | Resource state conflict (e.g., duplicate trade)             |
| `RATE_LIMIT_EXCEEDED`   | 429         | Too many requests in time window                            |
| `INTERNAL_SERVER_ERROR` | 500         | Unexpected server error                                     |
| `SERVICE_UNAVAILABLE`   | 503         | External service (blockchain, IPFS) temporarily unavailable |
| `STELLAR_RPC_ERROR`     | 502         | Stellar/Soroban RPC call failed                             |
| `CONTRACT_ERROR`        | 400         | Smart contract execution failed                             |
| `IPFS_ERROR`            | 503         | IPFS upload/retrieval failed                                |

### Common Error Responses

**401 Unauthorized:**

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired JWT token",
    "statusCode": 401,
    "correlationId": "12345678-1234-5678-1234-567812345678"
  }
}
```

**429 Rate Limited:**

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many dispute requests. Max 5 per hour.",
    "statusCode": 429,
    "correlationId": "12345678-1234-5678-1234-567812345678",
    "retryAfter": 3542
  }
}
```

**503 Service Unavailable:**

```json
{
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "Stellar network temporarily unavailable. Please retry in 30 seconds.",
    "statusCode": 503,
    "correlationId": "12345678-1234-5678-1234-567812345678"
  }
}
```

---

## Rate Limiting

Rate limits are enforced per authenticated wallet address:

| Endpoint              | Window     | Limit       |
| --------------------- | ---------- | ----------- |
| `/auth/login`         | 15 minutes | 10 attempts |
| `/trades` (GET)       | 1 minute   | 30 requests |
| `/trades/:id/dispute` | 1 hour     | 5 disputes  |
| All other endpoints   | 1 minute   | 30 requests |

**Response Headers:**

```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 3
X-RateLimit-Reset: 1234567890
```

---

## CORS Policy

CORS is configured via the `CORS_ORIGINS` environment variable (comma-separated list).

**Development (permissive):**

```
CORS_ORIGINS=
```

**Production:**

```
CORS_ORIGINS=https://app.amana.com,https://staging.amana.com
```

**Response Headers:**

```
Access-Control-Allow-Origin: https://app.amana.com
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

---

## Distributed Tracing

Every request is assigned correlation and request IDs for observability:

```
Request:  x-correlation-id: 12345678-1234-5678-1234-567812345678 (optional)
Response: x-correlation-id: 12345678-1234-5678-1234-567812345678
Response: x-request-id:      87654321-4321-8765-4321-876543218765
```

Use these IDs to correlate:

- Application logs (Pino JSON logs)
- OpenTelemetry traces (Jaeger, Zipkin, Prometheus)
- Database query logs

---

## Integration Examples

### JavaScript/TypeScript

```typescript
const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";

const response = await fetch("http://localhost:4000/trades", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${jwt}`,
    "Content-Type": "application/json",
    "x-correlation-id": "my-correlation-123",
  },
  body: JSON.stringify({
    sellerAddress: "GXXXXXXX...",
    amountUsdc: "1000.50",
    buyerLossBps: 5000,
    sellerLossBps: 5000,
  }),
});

const { data } = await response.json();
console.log("Correlation ID:", response.headers.get("x-correlation-id"));
```

### cURL

```bash
curl -X POST http://localhost:4000/trades \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -H "x-correlation-id: my-correlation-123" \
  -d '{
    "sellerAddress": "GXXXXXXX...",
    "amountUsdc": "1000.50",
    "buyerLossBps": 5000,
    "sellerLossBps": 5000
  }'
```

---

## Health Check

**Endpoint:** `GET /health`

**Authentication:** Not required

**Response (200 OK):**

```json
{
  "status": "healthy",
  "timestamp": "2026-06-24T10:30:00Z",
  "version": "1.0.0",
  "services": {
    "database": "healthy",
    "redis": "healthy",
    "stellar": "healthy",
    "ipfs": "healthy"
  }
}
```

---

## Support & Debugging

For debugging, collect:

1. **Correlation ID** from response headers
2. **Request/Response JSON** (sanitize secrets)
3. **Timestamp** of the request
4. **Endpoint & HTTP method**

Then query logs:

```bash
grep "correlation_id=12345678" logs/amana-backend.log
```

Or in Jaeger/Zipkin UI, search by trace ID.
