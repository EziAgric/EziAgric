# Admin Soroban Transaction Failure Alerting

Alerts operators when admin Soroban submissions (e.g. stream clawback) fail
repeatedly, so operational issues (bad `ADMIN_SECRET_KEY`, RPC outage, invalid
XDR) are caught quickly instead of silently piling up.

## How it works

`backend/src/lib/adminTxFailureMonitor.ts` tracks failures per admin action
in a rolling window. It is called from `classifyAdminSubmissionError()`
(`backend/src/errors/adminSubmissionError.ts`), the single choke point every
admin Soroban submission failure passes through (stream terminate, add/remove
mediator, update fee bps, etc.). Once the failure count in that window
reaches the configured threshold, it dispatches an `admin_soroban_tx_failure`
alert via the existing `alertService` (see `docs/admin-notifications.md` for
how alert webhooks are configured) and resets the counter.

The alert message includes the affected admin action/endpoint, the failure
count, and the error class/message, e.g.:

```
Admin Soroban transaction endpoint stream_terminate failed 5 times in the last 300s
```

## Tuning

| Env var                        | Default | Description                                        |
| ------------------------------- | ------- | --------------------------------------------------- |
| `ADMIN_TX_FAILURE_THRESHOLD`    | `5`     | Number of failures within the window before alerting |
| `ADMIN_TX_FAILURE_WINDOW_MS`    | `300000` (5 min) | Rolling window used to count failures      |

Lower the threshold or shorten the window for faster detection in
high-traffic environments; raise them to reduce noise from transient RPC
blips. Both are read from `backend/src/config/env.ts` at startup, so changes
require a backend restart/redeploy to take effect.

Alert delivery itself (webhook URL, secret, cooldown) is shared with the rest
of the ops alerting system — see `ALERT_WEBHOOK_URL`, `ALERT_WEBHOOK_SECRET`,
and `ALERT_COOLDOWN_MS`.
