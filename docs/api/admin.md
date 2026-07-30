# Admin Endpoints

Every endpoint on this page requires a bearer token whose wallet address
appears in the `ADMIN_STELLAR_PUBKEYS` environment variable (a
comma-separated allowlist of Stellar public keys). This is enforced by
`adminMiddleware`, stacked after the usual `authMiddleware`:

1. No/invalid token -> `401 Unauthorized`
2. Valid token, wallet not on the allowlist -> `403 { "error": "Forbidden: admin access required" }`
3. Valid token, wallet on the allowlist -> request proceeds

The server also requires `ADMIN_SECRET_KEY` to be set since admin routes are
always mounted - startup fails fast with a fatal log if it's missing (see
[`.env.example`](../../backend/.env.example)).

### Request timeouts

Admin routes that build a Soroban transaction (contract maintenance below)
are wrapped in a hard wall-clock timeout so a stalled RPC call can't hang
the request indefinitely. If the timeout elapses before a response is sent,
the caller gets `504`:

```json
{ "code": "ADMIN_OPERATION_TIMEOUT", "error": "Admin operation timed out" }
```

Configured via `ADMIN_ROUTE_TIMEOUT_MS` (default `15000`).

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

## Auth diagnostics

`GET /api/admin/auth/claims` - returns the sanitized JWT claims the backend
parsed from the caller's bearer token, so an admin can verify exactly what
the server sees (wallet address, token id, issuer/audience, issued/expiry
times) without decoding the token by hand. Protected by the standard admin
auth rules above (`401`/`403`). Raw JWT fields not meaningful to display
(`sub`, `nbf`) are omitted - this is a diagnostic view, not a raw token dump.

```json
{
  "walletAddress": "GADMIN...",
  "tokenId": "9f2c...",
  "issuedAt": "2026-07-29T12:00:00.000Z",
  "expiresAt": "2026-07-30T12:00:00.000Z",
  "issuer": "amana",
  "audience": "amana-api"
}
```

Note this endpoint lives at `/api/admin/auth/claims` rather than
`/admin/auth/claims` like the other admin routes on this page - intentional,
per the ticket that introduced it.

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

### Quota

`POST /treasury/withdraw` is quota-limited per admin identity (the caller's
wallet address, or the `x-api-key` header when present instead of a wallet)
to guard against accidentally submitting a large number of clawbacks.
Requests over the limit get `429`:

```json
{
  "code": "ADMIN_QUOTA_EXCEEDED",
  "message": "Treasury withdrawal (clawback) quota exceeded for this admin, try again later.",
  "details": { "operation": "treasury.withdraw", "limit": 10, "windowMs": 3600000, "retryAfterSeconds": 1800 }
}
```

Configured via `ADMIN_QUOTA_CLAWBACK_WINDOW_MS` (default `3600000`, i.e. 1
hour) and `ADMIN_QUOTA_CLAWBACK_MAX` (default `10`) - see
[`.env.example`](../../backend/.env.example). The window resets automatically
once `windowMs` elapses since the admin's first request in the window.

`POST /admin/trades/batch/status` (below) is quota-limited the same way via
`ADMIN_QUOTA_TRADE_BATCH_WINDOW_MS` / `ADMIN_QUOTA_TRADE_BATCH_MAX` (defaults:
1 hour / 20 requests).

### Retry policy

Admin Soroban transaction submission automatically retries transient RPC
failures (timeouts, connection errors, rate limiting/`TRY_AGAIN_LATER`) with
fixed-step backoff, up to `SOROBAN_SUBMIT_MAX_RETRIES` (default `3`)
attempts using `SOROBAN_SUBMIT_BACKOFF_MS` (default `1000,2000,4000,8000`ms).
Persistent failures (invalid XDR, contract panics, definitive RPC rejections)
are never retried and still return an error immediately. See
[ADR-004](../adr/ADR-004-idempotency-and-retry-strategy.md#retry-and-circuit-breaking-for-server-to-dependency-calls-not-client-requests)
for the full policy.

## Streams

Vested token streams the admin dashboard can act on.

`GET /admin/streams` - paginated list of streams, newest first (#51).

**Query params**

| Param | Required | Notes |
|---|---|---|
| `page` | no | 1-indexed page number, defaults to `1` |
| `limit` | no | Page size, defaults to `20`, capped at `100` |
| `status` | no | Lifecycle state: `ACTIVE`, `SUSPENDED`, `TERMINATED`, `COMPLETED` |
| `vestingState` | no | Derived from `claimed` vs. `totalVested`, independent of `status`: `not_started`, `vesting`, `fully_vested` |
| `adminTag` | no | Operator-assigned label (e.g. `high-value`, `legal-hold`) |

**Response `200`**

```json
{
  "items": [
    {
      "streamId": "stream-abc-123",
      "recipient": "GRECIPIENT...",
      "status": "ACTIVE",
      "vestingState": "vesting",
      "totalVested": "10000",
      "claimed": "2500",
      "unclaimed": "7500",
      "pendingClawback": "0",
      "adminTags": ["high-value"],
      "createdAt": "2026-07-01T00:00:00.000Z",
      "updatedAt": "2026-07-05T00:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

`POST /admin/streams/:id/clawback/preview` - validates a requested clawback
amount against the stream's real remaining vested (`unclaimed`) balance and
returns the resulting post-clawback balance, without performing the
clawback. This is what the admin confirmation modal calls before an operator
confirms, and what the frontend's client-side amount validation mirrors so
the "Confirm" button is disabled before a doomed request is even sent.

```json
{ "amount": "3000" }
```

**Response `200`**

```json
{
  "streamId": "stream-abc-123",
  "remainingVested": "7500",
  "requestedClawback": "3000",
  "postClawbackBalance": "4500",
  "preview": true,
  "timestamp": "2026-07-30T12:00:00.000Z"
}
```

`POST /admin/streams/:id/suspend`, `POST /admin/streams/:id/resume`, and
`POST /admin/streams/:id/terminate` change a stream's lifecycle `status`;
see the [OpenAPI spec](../../backend/src/docs/openapi.yaml) for the full
request/response shape of `terminate` (the only one of the three currently
backed by real state and an `AdminActionAudit` record - `suspend`/`resume`
are stubs pending their own tracked issues).

### Client-visible admin error states (#59)

Stream/clawback routes use the same `{ code, message, details }` envelope as
the rest of the API (see [overview.md](./overview.md)). The error codes a
frontend should branch on for these routes:

| Code | HTTP status | Meaning |
|---|---|---|
| `NOT_FOUND` | 404 | The stream id in the URL doesn't exist |
| `CLAWBACK_INVALID_AMOUNT` | 400 | Requested amount is zero, negative, or not a valid integer string |
| `CLAWBACK_TOO_LARGE` | 400 | Requested amount exceeds the stream's `unclaimed` (remaining vested) balance - `details.remainingVested` carries the actual limit |
| `VALIDATION_ERROR` | 400 | Malformed request body/query (e.g. bad `page`/`limit`, unknown `status` enum value) |
| n/a (`{ "error": "..." }`) | 403 | Caller is authenticated but not on the admin allowlist - see the [request timeouts](#request-timeouts) section above for the auth rules |
| `INTERNAL_ERROR` | 500 | Unexpected backend failure; safe to show a generic retry message |

For every other admin route in this document, the same envelope and the
401/403 rules at the top of this page apply; route-specific codes are called
out in each section (e.g. `ADMIN_QUOTA_EXCEEDED`, `FEATURE_DISABLED`).

## Contract maintenance

Governance/maintenance operations that previously required the
`soroban contract invoke` CLI. Like `POST /treasury/withdraw`, these build an
unsigned Soroban transaction using the same `ContractService` transaction-
building helpers as the trade flows (`contract.call(...)` + `prepareTransaction`)
— the caller's admin wallet is the transaction source, and the caller signs
and submits the returned XDR themselves. The on-chain contract independently
enforces `admin.require_auth()`, so a stolen/forged unsigned XDR is useless
without the admin's signature.

`POST /admin/contract/mediators` - builds an `add_mediator` transaction
registering a wallet as a mediator.

```json
{ "mediatorAddress": "GMED...ABC" }
```

`DELETE /admin/contract/mediators/{address}` - builds a `remove_mediator`
transaction revoking a wallet's mediator status.

`PATCH /admin/contract/fee` - builds an `update_fee_bps` transaction changing
the platform fee rate (basis points, `1`-`500`). Out-of-range values are
rejected with `400` before a transaction is built; the contract also enforces
these bounds on-chain.

```json
{ "feeBps": 250 }
```

All three respond `200 { "unsignedXdr": "..." }` on success, `400` on
malformed input (invalid Stellar address, out-of-range fee), `401`/`403` per
the standard admin auth rules above, `504` on timeout (see above). Each
successful call is recorded in `AdminActionAudit` (`ADD_MEDIATOR`,
`REMOVE_MEDIATOR`, `UPDATE_FEE_BPS`) alongside the caller's wallet address.

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

Each call is recorded in `AdminActionAudit` as `TRADE_BATCH_STATUS_UPDATE`,
with the full `succeeded`/`failed` breakdown captured in the `note` column.

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

Each update is recorded in `AdminActionAudit` as `UPDATE_FEATURE_FLAG`, with
the applied `enabled`/`rolloutPercentage` values captured in the `note`
column.

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
