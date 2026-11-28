# Error Reference

## Envelope shapes

Most routes return a **structured error**:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Validation failed",
  "details": [{ "path": "body.amountUsdc", "message": "Invalid amount format" }],
  "timestamp": "2026-07-05T12:00:00.000Z",
  "path": "/trades",
  "requestId": "...",
  "correlationId": "..."
}
```

A handful of older/simpler routes (mostly the Stellar proxy endpoints in
[stellar.md](./stellar.md) and a few `403` checks) instead return a
**legacy envelope**:

```json
{ "error": "Forbidden" }
```

Check for `code` first; if absent, fall back to `error`. Both shapes are
called out per-endpoint in [trades.md](./trades.md), [stellar.md](./stellar.md),
and [admin.md](./admin.md) where they differ from the structured default.

`requestId` and `correlationId` (when present) identify the request in
server logs/tracing - include them when reporting an issue.

## Error codes

| Code | Typical HTTP status | Meaning | What to do |
|---|---|---|---|
| `VALIDATION_ERROR` | 400 | Request body/query failed schema validation | Fix the field(s) listed in `details` and retry - don't retry unchanged |
| `AUTH_ERROR` | 401 | Missing, expired, revoked, or otherwise invalid bearer token | Re-run the [challenge/verify flow](./overview.md#authentication) to get a fresh token |
| `DOMAIN_ERROR` | 400/403 | A business rule was violated (rather than a schema failure) | Message/`details` explain the rule; not retryable without changing the request |
| `INFRA_ERROR` | 500/503 | A dependency (JWT config, database, etc.) failed | Transient - safe to retry with backoff; if it persists, treat it as a service incident |
| `NOT_FOUND` | 404 | The resource doesn't exist, or you don't have access to see that it does | Check the identifier; some endpoints intentionally 404 instead of 403 to avoid leaking existence |
| `INTERNAL_ERROR` | 500 | Unhandled server error | Retry once with backoff; if it repeats, report `requestId` |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests for the bucket the endpoint belongs to | Wait `details.retryAfterSeconds` before retrying - see [overview.md](./overview.md#rate-limits) |

### Trade-specific codes

| Code | HTTP status | Meaning | What to do |
|---|---|---|---|
| `TRADE_NOT_FOUND` | 404 | No trade with that id (or id malformed) | Confirm the `tradeId` |
| `TRADE_ACCESS_DENIED` | 403 | Caller is not the buyer/seller/admin required for this action | Check which role the action requires - see [trades.md](./trades.md) |
| `TRADE_INVALID_STATUS` | 400 | The trade isn't in the status this action requires (e.g. confirming delivery on a trade that isn't `FUNDED`) | Fetch the trade's current `status` and only call the action valid for it |
| `TRADE_BUILD_FAILED` | 500 | Building the Stellar/Soroban transaction failed server-side | Retryable; if it persists the underlying contract/network call is likely failing |

### Dispute-specific codes

| Code | HTTP status | Meaning | What to do |
|---|---|---|---|
| `DISPUTE_INVALID_CATEGORY` | 400 | `category`/`categoryId` doesn't match an active dispute category | Fetch `GET /dispute-categories` for valid values |
| `DISPUTE_STATUS_TRANSITION_INVALID` | 400 | Requested dispute status change isn't a legal transition | Check the dispute's current status before transitioning |
| `DISPUTE_STATUS_CONFLICT` | 409 | Dispute was modified concurrently (optimistic-lock conflict) | Re-fetch the dispute and retry |
| `DISPUTE_NOT_FOUND` | 404 | No dispute with that id | Confirm the identifier |

### Payment provider codes

These surface from the path-payment/quote flow when the upstream payment
provider misbehaves.

| Code | Meaning | What to do |
|---|---|---|
| `PAYMENT_PROVIDER_ERROR` | The payment provider returned an error | Not generally retryable without changing input; check `details` |
| `PAYMENT_PROVIDER_TIMEOUT` | The payment provider didn't respond in time | Safe to retry with backoff |
| `PAYMENT_INSUFFICIENT_FUNDS` | The quoted route can't be filled at the requested amount | Retry with a smaller `sourceAmount` or a different `sourceAsset` |

## Resolution checklist

1. **Read `code` before `message`** - `message` is for humans/logs and can
   change wording over time; `code` is the stable contract to branch on.
2. **`401` is always worth one retry** after re-authenticating - tokens
   expire (`JWT_EXPIRES_IN`, default 24h) and can be revoked by logout on
   another session.
3. **`429` and `INFRA_ERROR`/`5xx`** are the only cases worth an automatic
   retry with backoff. Everything else (`400`, `403`, `404`, `409`) means
   the request itself needs to change first.
4. **`403` vs `404`**: some endpoints (e.g. fetching another user's trade)
   intentionally return `404` instead of `403` to avoid confirming that a
   resource exists for an unauthorized caller. Don't assume a `404` means
   "never existed."
5. When reporting a bug, include the endpoint, `code`, and `requestId`
   (or `correlationId`) from the response - that's what maps back to a
   specific server-side log entry.
