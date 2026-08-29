# Alert Routing, Runbook Linkage, and Deduplication

How ops alerts are classified, routed, deduplicated, and reviewed, so real
incidents don't drown in noise and every alert tells the recipient exactly
where to start.

## 1. Severity rubric: page vs. ticket

Every alert type is classified in
[`backend/src/config/alertRegistry.ts`](../backend/src/config/alertRegistry.ts)
as one of:

| Routing | Meaning | Response |
|---|---|---|
| **page** | Production impact or fund risk — matches P0/P1 in [incident-response.md](./runbooks/incident-response.md) | Immediate — treat as an incident, follow the runbook link in the alert |
| **ticket** | Degraded but workable — matches P2/P3 | Same/next business day triage, no page |

`ALERT_REGISTRY` is typed as `Record<AlertType, AlertRegistryEntry>`, so
adding a new `AlertType` to `alert.service.ts` without also classifying it
here fails the backend TypeScript build — there is no path to shipping an
alert type without a routing decision and a runbook link.

## 2. Runbook linkage

Every dispatched alert payload includes `routing` and `runbookUrl` fields,
sourced from the registry entry for that alert type. The recipient (page or
ticket) always has a concrete next step to open, rather than having to
guess which doc applies.

`backend/src/__tests__/alertRegistry.test.ts` runs in CI on every backend
test run and asserts, for every registered alert type:

- `runbookUrl` is non-empty and points at either a doc path or an `http(s)`
  URL.
- `routing` is one of `page` / `ticket`.
- `description` is non-empty.

This is the "zero alerts without a runbook link, validated in CI" guarantee
from this policy — a registry entry missing a runbook link fails that test,
not just code review.

## 3. Deduplication / grouping windows

`AlertService.dispatch()` suppresses repeat alerts of the same type within a
dedupe window: `dedupeWindowMs` from the alert's registry entry if set,
otherwise the service-wide `ALERT_COOLDOWN_MS` (default 5 minutes — see
[admin-tx-failure-alerting.md](./admin-tx-failure-alerting.md) for how that
default is tuned).

Per-type windows exist for alert classes with their own natural cadence —
for example `synthetic_probe_failure` uses a 15-minute window because the
probe itself only runs hourly, so the default 5-minute cooldown would still
allow re-paging on the very next run while the same break is being fixed.
Add a `dedupeWindowMs` override in the registry for any alert type whose
natural repeat interval doesn't match the default cooldown.

## 4. On-call and escalation

There is no dedicated 24/7 on-call rotation yet; the escalation chain is the
same one defined in
[incident-response.md](./runbooks/incident-response.md#escalation-matrix):
whoever is reachable acknowledges a page, and unacknowledged P0/P1 pages
escalate to the secondary/eng lead per that table. Formalizing a rotation
schedule is tracked as a follow-up once team size justifies it — until then,
every `page`-routed alert type here should map to a severity in that table
so escalation timing is unambiguous.

## 5. Monthly alert review

Once a month, review the alert set for noise: alert types that fire without
a corresponding real incident, dedupe windows that are clearly too short or
too long, and any `page`-routed alert that in practice never needs
immediate action (demote it to `ticket`). Log every review — including "no
changes needed" — in [alert-review-log.md](./alert-review-log.md) so the
review cadence itself is auditable.

## 6. Adding a new alert type

1. Add the new value to the `AlertType` union in
   `backend/src/services/alert.service.ts`.
2. Add a matching entry to `ALERT_REGISTRY` in
   `backend/src/config/alertRegistry.ts` — this is enforced by the compiler.
3. Pick `routing` using the rubric in §1, write a `runbookUrl` that actually
   resolves, and set `dedupeWindowMs` only if the default cooldown is wrong
   for this alert's natural frequency.
4. Run `pnpm test` — `alertRegistry.test.ts` validates the new entry's
   shape.
