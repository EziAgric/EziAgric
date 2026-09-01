# Inbound webhook secrets: configuration and rotation

Every inbound provider callback under `POST /webhooks/inbound/:provider` is
verified against a per-provider HMAC secret before any handler runs. A request
with no signature, a wrong signature, or a timestamp outside the tolerance
window is rejected — and a provider with no configured secret is rejected too,
so a route can never be added without its secret.

## Configuration

Two environment variables drive verification:

| Variable | Meaning | Default |
| --- | --- | --- |
| `INBOUND_WEBHOOK_SECRETS` | JSON object of `provider -> secret`. A value may hold several comma-separated secrets; each is accepted. | unset (no provider verifies, all inbound requests are rejected) |
| `INBOUND_WEBHOOK_TOLERANCE_SECONDS` | Replay window applied symmetrically around the signed timestamp. | `300` |

```bash
INBOUND_WEBHOOK_SECRETS='{"stellar-anchor":"<secret>","payments-psp":"<secret>"}'
INBOUND_WEBHOOK_TOLERANCE_SECONDS=300
```

Provider names are matched case-insensitively against the `:provider` path
segment.

## The signature scheme

Providers must send two headers:

| Header | Value |
| --- | --- |
| `X-Webhook-Timestamp` | Unix time in **seconds**, as an integer |
| `X-Webhook-Signature` | `HMAC_SHA256(secret, "<timestamp>." + <raw body>)`, hex-encoded |

The timestamp is folded into the signed string on purpose: signing the body
alone would let anyone replay a captured payload under a fresh timestamp. The
digest covers the **raw** bytes, so a proxy that re-serialises JSON will break
verification.

Reference implementation — the same function the server uses to verify:

```ts
import { computeWebhookSignature } from "../middleware/webhookSignature.middleware";

const timestamp = String(Math.floor(Date.now() / 1000));
const signature = computeWebhookSignature(secret, timestamp, rawBody);
```

## Rejection reasons

Each rejection increments `webhook_signature_verifications_total` with a
`provider` and `outcome` label. `outcome="verified"` is the accepting case.

| `outcome` | Status | Meaning |
| --- | --- | --- |
| `missing_secret` | 503 | Provider has no secret configured — a deploy gap on our side, so the provider should retry |
| `missing_signature` | 401 | No `X-Webhook-Signature` header |
| `missing_timestamp` | 401 | No `X-Webhook-Timestamp` header |
| `malformed_timestamp` | 400 | Timestamp is not an integer |
| `stale_timestamp` | 401 | Timestamp outside the tolerance window — a replay, or badly skewed clocks |
| `missing_raw_body` | 400 | Body was not captured; check that `express.json` still uses the `captureRawBody` verify hook |
| `invalid_signature` | 401 | Digest mismatch — a wrong secret, a tampered body, or a forgery |

## Alerting

Alert on the rate of non-`verified` outcomes per provider:

- A sustained spike in `invalid_signature` means someone is probing the endpoint
  with forged payloads, or a rotation was completed on one side only.
- Any `missing_secret` at all means a provider is live in routing but absent
  from `INBOUND_WEBHOOK_SECRETS` — every one of its deliveries is being dropped.
- A spike in `stale_timestamp` with no other change usually means clock drift on
  a delivery worker, not an attack.

Suggested threshold: page when non-`verified` exceeds 5% of a provider's
deliveries over 5 minutes, or on any `missing_secret` inside 15 minutes.

## Rotation runbook

Because a provider's entry accepts a comma-separated list, old and new secrets
can overlap and no delivery is dropped.

1. **Generate** the new secret:
   ```bash
   openssl rand -hex 32
   ```
2. **Add** it alongside the current one, new value first, and deploy. Both are
   now accepted:
   ```bash
   INBOUND_WEBHOOK_SECRETS='{"stellar-anchor":"<new>,<old>"}'
   ```
3. **Switch** the provider to sign with the new secret in their dashboard or
   API. Deliveries keep verifying throughout — some against the new secret,
   any in flight against the old.
4. **Confirm** the cutover before removing anything: watch
   `webhook_signature_verifications_total` for that provider until traffic is
   steady and `invalid_signature` is flat. Leave the overlap in place for at
   least one full delivery-retry cycle (`WEBHOOK_MAX_ATTEMPTS` ×
   `WEBHOOK_RETRY_MAX_MS`) so retries signed with the old secret still land.
5. **Remove** the old secret and deploy:
   ```bash
   INBOUND_WEBHOOK_SECRETS='{"stellar-anchor":"<new>"}'
   ```
6. **Revoke** the old secret at the provider so it cannot be reused.

### Emergency rotation (secret suspected leaked)

Skip the overlap: replace the value with the new secret alone and deploy, then
update the provider. Deliveries signed with the leaked secret start failing
immediately with `invalid_signature`, which is the intent — the provider's own
retries will redeliver them once it is signing correctly again.
