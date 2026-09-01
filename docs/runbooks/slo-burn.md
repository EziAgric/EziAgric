# Runbook: SLO error-budget burn

Applies when a burn-rate alert from `infra/prometheus/slo-alerting-rules.yml`
fires for S1–S4 (docs/slo.md).

## Quick triage

1. **Identify the burning SLO** from the alert labels (`slo=S1..S4`).
2. **Severity path:**
   - `severity=page` (fast burn) → follow the incident process in
     [`incident-response.md`](./incident-response.md) now.
   - `severity=ticket` (slow burn) → triage same/next business day.

## Triage queries (per SLO)

- **S1/S2 (API):** inspect `http_server_duration_milliseconds_count` by
  `http_status_code` and `route`. A 5xx spike points at a failing backend,
  an external dependency, or our own upstream (Stellar RPC / IPFS / Redis).
- **S3 (payout):** inspect `amana_trades_total` by `event`
  (`released`/`refunded`/`disputed`). A jump in `refunded`/`disputed` means
  funds aren't reaching sellers — check `handleFundsReleased`, the payout
  signing path, and Stellar transaction submission
  (`stellar_transaction_submissions_total`).
- **S4 (event lag):** inspect `event_listener_processing_lag_seconds`. Rising
  lag means the event listener is stalled or the queue is backed up — check
  `eventListener.service.ts` poll health and Redis queue depth.

## Freeze / sprint

While the budget is ≥ 90% consumed or an alert is active:

1. **Freeze** non-essential feature PRs touching the affected component.
2. **Reliability sprint** — start a focused fix + regression guard.
3. Confirm the budget roadmap in the next weekly snapshot.

## Restoration

When the SLI returns within budget (clean > 24h) and the fix is merged with a
regression guard, lift the freeze and log the resolution in the weekly SLO
review ([`docs/slo-review-log.md`](../slo-review-log.md)) and
[`docs/postmortems/`](../postmortems/).
