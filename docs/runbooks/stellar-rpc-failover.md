# Stellar RPC Failover Runbook

**Audience:** On-call engineers
**Scope:** Backend Stellar RPC connectivity (`backend/`)
**Goal:** Restore trade settlement when the primary Stellar RPC node is degraded or down.

---

## 1. Overview

The backend talks to a Stellar RPC node to submit and query transactions. If that node is
unreachable, trades cannot be settled. This runbook documents the providers we use, the
environment variables that select them, and the procedure to fail over without downtime.

## 2. Providers

| Role     | Provider            | Notes                                              |
| -------- | ------------------- | -------------------------------------------------- |
| Primary  | Stellar RPC (SDF)   | `https://soroban-testnet.stellar.org` (testnet) / `https://mainnet.stellar.validationcloud.io` (mainnet) |
| Fallback 1 | Validation Cloud  | Managed Stellar RPC, requires API key              |
| Fallback 2 | QuickNode         | Managed Stellar RPC, requires API key              |

> Confirm the exact URLs for the current network (testnet vs. mainnet) before switching.

## 3. Relevant environment variables

Set in `backend/.env` (see `backend/.env.example`):

| Variable                | Purpose                                              |
| ----------------------- | ---------------------------------------------------- |
| `STELLAR_RPC_URL`       | RPC endpoint the backend connects to                 |
| `STELLAR_NETWORK`       | `testnet` or `mainnet`                               |
| `STELLAR_RPC_API_KEY`   | API key for managed providers (Validation Cloud / QuickNode) |
| `STELLAR_RPC_TIMEOUT_MS`| Request timeout in milliseconds                      |

## 4. Verify RPC connectivity

Run from a shell with the current env loaded:

```bash
curl -sS -X POST "$STELLAR_RPC_URL" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' | jq .
```

A healthy node returns `{"result":{"status":"healthy"}}`. Any error, timeout, or
non-`healthy` status means the node is degraded — proceed to failover.

## 5. Failover procedure (no downtime)

1. **Confirm the outage.** Run the connectivity check in §4 against the current
   `STELLAR_RPC_URL`. Check the provider status page.
2. **Pick a fallback.** Choose Fallback 1 (Validation Cloud); if it is also unhealthy,
   use Fallback 2 (QuickNode).
3. **Validate the fallback first.** Run the §4 check against the candidate URL *before*
   changing anything, so you never point the backend at a dead node.
4. **Update the secret/config.** Set `STELLAR_RPC_URL` (and `STELLAR_RPC_API_KEY` if the
   provider requires one) in the deployment environment / secret store. Do **not** edit
   committed files.
5. **Roll out gradually.** Restart or redeploy backend instances one at a time (rolling
   restart) so at least one instance keeps serving traffic throughout.
6. **Verify.** Re-run the §4 check and confirm settlement requests succeed in logs
   (no RPC timeout errors).
7. **Record the incident.** Note the provider switched to, the time, and the reason in the
   incident ticket.

## 6. Rollback

Once the primary provider is healthy again (verified with §4), repeat steps 4–6 pointing
`STELLAR_RPC_URL` back to the primary endpoint.

## 7. Escalation

If both fallbacks are unhealthy, escalate to the platform lead and open a provider support
ticket. Settlement is blocked until an RPC node is reachable.
