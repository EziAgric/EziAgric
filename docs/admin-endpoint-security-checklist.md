# Admin Endpoint Exposure Security Checklist

This checklist is the mandatory security review gate for **any** admin route
change before it is deployed. Admin endpoints are privileged and are reviewed
separately from ordinary API routes. Teams MUST work through this checklist and
tick every item before merging or deploying admin route changes.

For the complete guide on adding/modifying admin routes (middleware order, tests,
OpenAPI, env vars) see [admin-route-contribution-guide.md](./admin-route-contribution-guide.md).
For operational authorisation and tracing reference, see
[admin-operations.md](./admin-operations.md) and
[admin-ci-policy.md](./admin-ci-policy.md).

---

## 1. Authentication and authorisation

- [ ] The route is stacked with `authMiddleware` **then** `adminMiddleware` **before** the handler (order matters).
  ```typescript
  router.post("/api/admin/...", authMiddleware, adminMiddleware, adminRateLimit, handler);
  ```
- [ ] `authMiddleware` returns `401` for missing, malformed, expired, or revoked tokens.
- [ ] `adminMiddleware` checks `ADMIN_STELLAR_PUBKEYS` via `isMediatorAddress()`/`isAdminAddress()` and returns `403` for wallets not on the allowlist.
- [ ] The admin allowlist is **never** echoed, logged, or included in error responses.
- [ ] `adminMiddleware` still verifies token freshness (`exp`) and revocation (`jti`) — not just allowlist membership.
- [ ] The route is mounted behind `adminFeatureGate` in `app.ts` so it returns `404` when `ADMIN_ROUTES_ENABLED !== "true"`.
- [ ] If the action signs an on-chain Soroban call, the backend only builds/signs with the authorised admin key; the admin wallet is derived from the authenticated identity, never from unauthenticated input.
- [ ] Tests cover `401` (no/malformed/expired/revoked token), `403` (non-admin wallet), and the authorised success path. See [admin-ci-policy.md](./admin-ci-policy.md).

## 2. Rate limiting and quotas

- [ ] A per-identity wallet rate limiter (`createWalletRateLimiter(RATE_LIMIT_CONFIG.admin)`) is applied to the route.
- [ ] Expensive or bulk operations also apply the relevant in-memory admin quota (`createAdminQuotaMiddleware`) — e.g. batch trade status, clawback, treasury withdrawal.
- [ ] Rate-limit and quota config values are sane defaults enforced centrally (`RATE_LIMIT_CONFIG.admin`, `ADMIN_QUOTA_CONFIG`), not per-request literals.
- [ ] The `/api/admin/sessions/revoke` path and other sensitive/security endpoints are not exempted from rate limiting without a documented exception.
- [ ] A `429` response distinguishes rate limiting from auth failures; it leaks no details about the admin allowlist or other identities.

## 3. Error messages and information disclosure

- [ ] Error responses use the classified error mapping (`adminSubmissionError.ts`) / `AppError` codes rather than raw stack traces or Prisma/Soroban internals.
- [ ] Responses do **not** reveal the admin allowlist, internal addresses, signing keys, or raw RPC payloads on failure.
- [ ] `validateRequest` failures return a generic `{ "error": "..." }` body without sensitive context.
- [ ] Structured logs never log `ADMIN_SECRET_KEY` or raw wallet addresses in production.
- [ ] Error output distinguishes `401 / 403 / 409 / 404` appropriately so clients can react without leaking internals.
- [ ] For contract admin endpoints that return unsigned XDR, errors map on-chain panic strings (e.g. `CLAWBACK_UNAUTHORIZED`) to stable error codes without echoing the panic source.

## 4. Exposure minimisation

- [ ] The new route(s) are gated behind `ADMIN_ROUTES_ENABLED` (off by default) and the admin allowlist.
- [ ] Admin routers are mounted on the internal/admin path namespace only; they must not be exposed on public-facing ingress or internal Ingress rules without the network isolation policy. See [admin-network-isolation.md](./admin-network-isolation.md).
- [ ] No operation is exposed that a non-privileged query could fulfil — avoid redundant admin-only read endpoints where a scoped, non-admin query already exists.
- [ ] All actions write an `AdminActionAudit` record (actor, action, target, timestamp) and/or structured audit log line.
- [ ] No admin secret or signing key is present in the route module, tests, or docs.
- [ ] The OpenAPI spec entry for the route is tagged `Admin` and carries `security: [{ BearerAuth: [] }]`.
- [ ] Deployment order is reviewed: secrets/env (`ADMIN_ROUTES_ENABLED`, `ADMIN_STELLAR_PUBKEYS`, `ADMIN_SECRET_KEY`) are configured **before** the route is enabled; a staging smoke test (`scripts/staging-admin-smoke-test.sh`) confirms `401/403` behaviour against the deployed environment before promotion to production.

---

## Naming the new backend admin endpoints

Every new or changed admin endpoint must be enumerated here so reviewers can
verify each against the four checklist sections above. A line item is required
**for each** of these new backend admin endpoints:

| Method   | Endpoint | Auth | Rate limit / quota | Audited |
| -------- | -------- | ---- | ------------------ | ------- |
| `POST`   | `/api/admin/contract/mediators` | auth + admin | admin rate limit | `ADD_MEDIATOR` |
| `DELETE` | `/api/admin/contract/mediators/:address` | auth + admin | admin rate limit | `REMOVE_MEDIATOR` |
| `PATCH`  | `/api/admin/contract/fee` | auth + admin | admin rate limit | `UPDATE_FEE_BPS` |
| `POST`   | `/api/admin/trades/batch/status` | auth + admin | rate limit + quota | `TRADE_BATCH_STATUS_UPDATE` |
| `GET`    | `/api/admin/features` | auth + admin | admin rate limit | read-only |
| `PATCH`  | `/api/admin/features/:name` | auth + admin | admin rate limit | audit |
| `GET`    | `/api/admin/audit` | auth + admin | admin rate limit | read-only |
| `GET`    | `/api/admin/auth/claims` | auth + admin | admin rate limit | read-only |
| `POST`   | `/api/admin/sessions/revoke` | auth + admin | admin rate limit | audit |
| `POST`   | `/api/admin/streams/:id/clawback/preview` | auth + admin | admin rate limit | audit |
| `POST`   | `/api/admin/streams/:id/suspend` | auth + admin | admin rate limit | audit |
| `POST`   | `/api/admin/streams/:id/resume` | auth + admin | admin rate limit | audit |
| `POST`   | `/api/admin/streams/:id/terminate` | auth + admin | admin rate limit | `STREAM_TERMINATE` |
| `POST`   | `/api/admin/streams/:id/lock` | auth + admin | admin rate limit | `STREAM_LOCK` |
| `POST`   | `/api/admin/streams/:id/unlock` | auth + admin | admin rate limit | `STREAM_UNLOCK` |
| `POST`   | `/api/admin/streams/:id/reconcile` | auth + admin | admin rate limit | read-only / audit |
| `GET`    | `/api/admin/streams` | auth + admin | admin rate limit | read-only |
| `GET`    | `/api/admin/streams/:id` | auth + admin | admin rate limit | read-only |

When adding a new endpoint to this project, append a row to the table and tick
the relevant sections above before opening the pull request for review.
