# Alert Review Log

Changelog of monthly alert reviews — see
[alert-routing-policy.md](./alert-routing-policy.md#5-monthly-alert-review)
for the review process this log records. Add one entry per review, newest
first, even when the outcome is "no changes."

## 2026-08 — Initial baseline review

Performed alongside the introduction of `ALERT_REGISTRY` and the
runbook-linkage/dedup policy.

**Alert types reviewed:** `db_connection_failure`, `redis_connection_failure`,
`cache_unavailable`, `reconciliation_drift_warning`,
`reconciliation_drift_critical`, `reconciliation_job_failure`,
`admin_soroban_tx_failure`, `synthetic_probe_failure`.

**Findings:**
- All eight existing alert types now carry an explicit `routing`
  (page/ticket) and `runbookUrl`; none were previously classified.
- `synthetic_probe_failure` (new, added with the staging synthetic probe)
  given a 15-minute dedupe window instead of the 5-minute default, since the
  probe it comes from only runs hourly.
- No alert type was demoted from `page` to `ticket` or vice versa in this
  pass — this is the baseline to compare future reviews against.

**Action items:** none this cycle. Next review: 2026-09.
