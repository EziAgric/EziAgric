# Runbook: Emergency Admin Clawback Execution

Use this runbook when funds must be clawed back from a funded/streaming
escrow trade outside the normal release flow — e.g. a dispute resolution
requires it, or a P0 incident (see [incident-response.md](./incident-response.md))
calls for pulling funds back under admin authority.

A clawback is **irreversible** once submitted on-chain. Always dry-run /
preview first.

## Prerequisites

- Admin authority: your wallet address is listed in `ADMIN_STELLAR_PUBKEYS`,
  or you hold the `ADMIN_SECRET_KEY` signing key (see
  [admin-secret-management.md](../admin-secret-management.md)).
- The `streamId` (trade ID) and clawback `amount` (in stroops), confirmed
  against the stream's `unclaimed` balance — the amount must not exceed it.
- Backend reachable (for the API path) or a local checkout with
  `ADMIN_SECRET_KEY` set (for the CLI path).

## Option A — HTTP API

1. **Preview the clawback** to validate amount and see current stream state
   without executing anything:
   ```bash
   curl -X POST https://<host>/api/admin/streams/<streamId>/clawback/preview \
     -H "Authorization: Bearer <admin-jwt>" \
     -H "Content-Type: application/json" \
     -d '{"amount": "<amount-in-stroops>"}'
   ```
2. **Lock the stream** first if you need to prevent concurrent admin
   mutations while you work:
   ```bash
   curl -X POST https://<host>/api/admin/streams/<streamId>/lock \
     -H "Authorization: Bearer <admin-jwt>"
   ```
3. **Execute** via the stream termination path (which performs the clawback
   as part of terminating the stream):
   ```bash
   curl -X POST https://<host>/api/admin/streams/<streamId>/terminate \
     -H "Authorization: Bearer <admin-jwt>" \
     -H "Content-Type: application/json" \
     -d '{"reason": "<why this is being clawed back>"}'
   ```
   Include `unsignedTxXdr` in the body if you are pre-building the
   transaction client-side instead of letting the backend construct it.
4. **Unlock** the stream once done, if you locked it in step 2:
   ```bash
   curl -X POST https://<host>/api/admin/streams/<streamId>/unlock \
     -H "Authorization: Bearer <admin-jwt>"
   ```

Submission failures are classified and, if they repeat, trigger an
`admin_soroban_tx_failure` alert — see
[admin-tx-failure-alerting.md](../admin-tx-failure-alerting.md).

## Option B — CLI (bypasses the HTTP API)

Use this when the API/backend is unavailable but the RPC endpoint is
reachable, or for out-of-band emergency execution. Full flag reference:
[cli-clawback.md](../cli-clawback.md).

1. **Dry run** to confirm the stream ID and amount:
   ```bash
   ADMIN_SECRET_KEY=S... npx tsx backend/scripts/clawback.ts \
     --stream-id <streamId> \
     --amount <amount-in-stroops> \
     --dry-run
   ```
2. **Produce the signed transaction**:
   ```bash
   ADMIN_SECRET_KEY=S... npx tsx backend/scripts/clawback.ts \
     --stream-id <streamId> \
     --amount <amount-in-stroops> \
     --network <testnet|mainnet>
   ```
3. **Submit** the printed signed XDR (a deliberate, separate step):
   ```bash
   stellar tx submit --xdr "<signed-xdr>" --rpc-url <soroban-rpc-url>
   ```

## Rollback guidance

- **Before submission** (API or CLI): nothing has happened on-chain yet —
  simply do not submit the signed XDR, or unlock the stream if you locked it.
- **After submission**: a clawback cannot be undone. If it was executed in
  error, this is not a rollback scenario — follow
  [incident-response.md](./incident-response.md) and the
  [contract-rollback guidance in rollback.md](./rollback.md#contract-rollback)
  to assess and communicate impact, and involve the eng lead + treasury/admin
  key holder as listed in that runbook's escalation matrix.

## Related

- [admin-secret-management.md](../admin-secret-management.md) — provisioning/rotating `ADMIN_SECRET_KEY`
- [cli-clawback.md](../cli-clawback.md) — full CLI reference
- [admin-tx-failure-alerting.md](../admin-tx-failure-alerting.md) — alerting on repeated submission failures
- [incident-response.md](./incident-response.md) — severity classification and escalation
