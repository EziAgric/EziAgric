# Admin Session Device Binding

Tracking: issue #198. Extends the session revocation work from issue #49.

## Problem

Admin bearer tokens carried no device context. A stolen admin JWT worked from
any device or network until it expired; replay protection existed only at the
challenge level.

## Model

An admin obtains a **device-bound** admin token by calling `POST /api/admin/auth/step-up`
with a currently valid admin bearer. The new token:

- has a **short TTL** (`ADMIN_BOUND_JWT_EXPIRES_IN`, default 900s);
- carries `tier: "admin"`, `deviceHash`, and `ipClass` claims;
- is recorded in a Redis session registry (`admin_session:<jti>`, indexed per
  wallet), so it can be listed and revoked per device;
- causes the presenting token's JTI to be revoked (credential rotation).

`deviceHash` is a SHA-256 over stable client headers (`user-agent`,
`accept-language`, `sec-ch-ua`, `sec-ch-ua-platform`). `ipClass` is the request
IP masked to a prefix (`ADMIN_IP_V4_PREFIX_BITS` /24, `ADMIN_IP_V6_PREFIX_BITS`
/48) so ordinary NAT/DHCP churn inside one network does not force a re-challenge,
but a different ISP/region does. Neither value is PII.

## Enforcement

`adminMiddleware` validates context on **every** admin request, gated by env so
existing deployments opt in:

| `ADMIN_SESSION_BINDING_ENABLED` | `ADMIN_SESSION_BINDING_ENFORCE` | Behaviour |
|---|---|---|
| `false` (default) | — | No binding checks (unchanged). |
| `true` | `false` | Bound tokens are validated; legacy unbound admin bearers still pass (transition window). |
| `true` | `true` | Unbound admin bearers are rejected with `401 ADMIN_BINDING_REQUIRED` (`requiresStepUp: true`). |

When a bound token's recomputed `deviceHash` or `ipClass` does not match its
claims, the request is rejected with:

```json
{ "code": "ADMIN_CONTEXT_MISMATCH", "error": "Unauthorized: admin session context mismatch — step-up required", "requiresStepUp": true }
```

The client is expected to re-run challenge/verify and then `POST /api/admin/auth/step-up`
again from the new context — a step-up, not a silent accept. If the token's JTI
is no longer in the registry (revoked or expired), the response is
`401 ADMIN_SESSION_REVOKED`.

## Endpoints

| Method & path | Purpose |
|---|---|
| `POST /api/admin/auth/step-up` | Mint a device-bound admin token for the current request context; rotates (revokes) the presenting JTI. |
| `GET /api/admin/sessions` | List the caller's registered device sessions (`jti`, `deviceHash`, `ipClass`, `userAgent`, timestamps, `current`). |
| `POST /api/admin/sessions/revoke` | Body `{ "deviceHash": "…" }` revokes exactly that device's session(s); otherwise `{ "jti": "…" }` (or the caller's own token) is revoked. Revoked JTIs are added to the token denylist immediately. |

## Remaining work (follow-up)

- Silent refresh for the short admin TTL (client-side interceptor + a
  `/api/admin/auth/refresh` that re-binds within the same context).
- Admin UI surface for `GET /api/admin/sessions` + per-device revoke button.
- Anomaly scoring beyond exact match (e.g. ASN change vs. minor IP drift).
