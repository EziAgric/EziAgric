# Admin Endpoints

Every endpoint on this page requires a bearer token whose wallet address
appears in the `ADMIN_STELLAR_PUBKEYS` environment variable (a
comma-separated allowlist of Stellar public keys). This is enforced by
`adminMiddleware`, stacked after the usual `authMiddleware`:

1. No/invalid token -> `401 Unauthorized`
2. Valid token, wallet not on the allowlist -> `403 { "error": "Forbidden: admin access required" }`
3. Valid token, wallet on the allowlist -> request proceeds

There is no separate "admin login" - the same challenge/verify flow in
[overview.md](./overview.md#authentication) applies; admin status is purely
a function of which wallet signed in.

## Admin Audit Trail

Every privileged admin action is recorded in the application logs with an
`audit: true` marker for structured log querying. Each audit entry includes:

| Field | Description |
|---|---|
| `audit` | Always `true` for audit events — filter with `audit=true` in your log aggregator |
| `eventType` | Machine-readable event name (e.g., `FEATURE_FLAG_UPDATED`, `BATCH_TRADE_STATUS_UPDATE`, `TREASURY_WITHDRAWAL`) |
| `actionName` | Dot-separated action identifier (e.g., `admin.features.update`, `admin.treasury.withdraw`) for filtering and alerting |
| `adminAddress` | Stellar public key of the admin who performed the action (normalized) |
| `traceId` | OpenTelemetry trace ID linking the audit log entry to the distributed trace span |
| `spanId` | OpenTelemetry span ID for the specific admin request span |
| `timestamp` | ISO-8601 timestamp of when the action was performed |

### How admin identity flows through the system

1. `authMiddleware` validates the JWT token and attaches the decoded payload
   (including `walletAddress` and `sub`) to `req.user`.
2. `adminMiddleware` checks the wallet address against the
   `ADMIN_STELLAR_PUBKEYS` allowlist. If allowed, it sets
   `req.user.isAdmin = true` on the request context.
3. Downstream route handlers and controllers read `req.user.walletAddress`
   (and the `isAdmin` flag) to record the invoking admin's identity in audit
   log entries.

### Audited admin actions

| Action | Event Type | Route |
|---|---|---|
| Modify a feature flag | `FEATURE_FLAG_UPDATED` | `PATCH /admin/features/:name` |
| Batch trade status update | `BATCH_TRADE_STATUS_UPDATE` | `POST /admin/trades/batch/status` |
| Treasury withdrawal | `TREASURY_WITHDRAWAL` | `POST /treasury/withdraw` |

### Example audit log entry

```json
{
  "audit": true,
  "eventType": "FEATURE_FLAG_UPDATED",
  "actionName": "admin.features.update",
  "featureName": "new-checkout",
  "enabled": true,
  "rolloutPercentage": 25,
  "adminAddress": "gadmin...",
  "traceId": "00000000000000000000000000000001",
  "spanId": "0000000000000002",
  "timestamp": "2026-07-27T10:30:00.000Z"
}
```

Operators can query for all admin actions in a time window and trace every
privileged change back to the specific admin who performed it.

### Distributed tracing integration

Every admin request is automatically instrumented with OpenTelemetry. The
`adminMiddleware` annotates the active request span with:

| Span Attribute | Value |
|---|---|
| `admin.action` | `"privileged"` |
| `admin.address` | The admin's wallet address |
| `admin.verdict` | `"granted"` or `"denied"` |
| `is_admin` | `true` |

These span attributes allow observability platforms (Jaeger, Zipkin, etc.)
to filter and alert on all admin-level activity. The `traceId` and `spanId`
in each audit log entry link the log back to the corresponding trace span
for end-to-end distributed tracing.

## Treasury

The treasury holds funds swept from resolved/expired escrow contracts.

`GET /treasury/balance` - current balance of the escrow contract treasury.

```json
{ "balance": "50000.0000000", "asset": "USDC", "contractId": "CA..." }
```

`GET /treasury/config` - the treasury's contract id, network, and settlement
asset.

```json
{ "contractId": "CA...", "network": "testnet", "asset": "USDC" }
```

`POST /treasury/withdraw` - builds an unsigned withdrawal transaction moving
funds out of the treasury (e.g. a clawback of funds swept from an
expired/resolved escrow).

```json
{
  "destination": "GBBB...C4",
  "amount": "1000.0000000",
  "note": "Reclaiming funds from expired escrow per ticket OPS-42"
}
```

`note` is optional but strongly recommended for compliance: it's a free-text
reason/justification (max 2000 chars) captured alongside the caller's wallet
address in the `AdminActionAudit` table for every withdrawal, so ops/legal can
later answer "why was this clawback performed." Omitting it still succeeds,
but leaves the audit record's `note` column empty.

Response: `{ "unsignedXdr": "..." }`. As with trade transactions, the caller
still signs and submits this themselves - the backend never holds a signing
key for the treasury.

## Admin action audit history

`GET /admin/audit` - lists compliance-audit records of admin-initiated actions
(e.g. treasury withdrawals/clawbacks) from the `AdminActionAudit` table,
newest first. Backs the admin action history panel in the frontend.

**Query params**

| Param | Required | Notes |
|---|---|---|
| `page` | no | 1-indexed page number, defaults to `1` |
| `limit` | no | Page size, defaults to `20`, capped at `100` |

**Response `200`**

```json
{
  "items": [
    {
      "id": 42,
      "action": "TREASURY_WITHDRAW",
      "actorAddress": "GADMIN...",
      "targetReference": "GBBB...C4",
      "note": "Reclaiming funds from expired escrow per ticket OPS-42",
      "createdAt": "2026-07-05T12:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

## Batch trade status updates

`POST /admin/trades/batch/status`

Force-transitions up to 100 trades in one call, e.g. for support/ops
workflows where a trade is stuck. Bypasses the normal buyer/seller-only
transition endpoints in [trades.md](./trades.md), but still enforces the
same status-transition graph (you can't jump straight from `CREATED` to
`COMPLETED`).

**Request body**

```json
{
  "updates": [
    { "tradeId": "4294967297", "status": "CANCELLED" },
    { "tradeId": "4294967298", "status": "CANCELLED" }
  ]
}
```

**Response `200`** - always `200` even for partial failure; check
`succeeded`/`failed` per item rather than the HTTP status:

```json
{
  "succeeded": ["4294967297"],
  "failed": [
    { "tradeId": "4294967298", "reason": "Invalid transition from COMPLETED to CANCELLED" }
  ]
}
```

Failure reasons include `"Trade not found"`, an invalid-transition message,
and `"Concurrency conflict: trade was modified"` (another request updated
the same trade between this request's read and write - retry the batch for
just that trade).

## Feature flags

`GET /admin/features` - list every configured flag.

```json
{
  "flags": {
    "new-checkout": { "enabled": true, "updatedAt": "2026-07-05T12:00:00.000Z" },
    "beta-dashboard": { "enabled": true, "rolloutPercentage": 25, "updatedAt": "2026-07-01T09:00:00.000Z" }
  }
}
```

A flag not present in this map is treated as disabled everywhere.

`PATCH /admin/features/:name` - create or update a flag.

**Request body**

```json
{ "enabled": true, "rolloutPercentage": 25 }
```

| Field | Required | Notes |
|---|---|---|
| `enabled` | yes | Master on/off switch |
| `rolloutPercentage` | no | `0`-`100`. Omit (or `100`) for "on for everyone"; `0` for "off for everyone but flag stays configured"; anything in between gates a deterministic subset of users |

`400 VALIDATION_ERROR` if `rolloutPercentage` is outside `0`-`100`.

**Response `200`**

```json
{
  "name": "new-checkout",
  "flag": { "enabled": true, "rolloutPercentage": 25, "updatedAt": "2026-07-05T12:00:00.000Z" }
}
```

### How rollout percentage gating works

When a route is wrapped in `requireFeature('name')` middleware, the flag is
resolved per authenticated user (by JWT `sub`, falling back to
`walletAddress`), not per request:

- The same user always lands on the same side of the rollout line - a user
  in a 10% rollout stays in it on every request, they aren't re-rolled each
  time.
- A request with no authenticated user can't be placed in a partial
  rollout and is treated as disabled.
- A disabled route responds `503`:

```json
{ "code": "FEATURE_DISABLED", "error": "Feature 'new-checkout' is currently disabled" }
```

Flags are stored in Redis under `feature:<name>`, so flipping a flag via
`PATCH` takes effect immediately for all backend instances - no
redeploy required.
