# SLOs & Error-Budget Policy

## Why SLOs

Reliability work has no arbiter: without explicit targets, infrastructure and
robustness tasks lose to feature work by default until users hit an outage and
force the issue. This document sets **service level objectives** (SLOs), turns
them into **error budgets**, and defines what spending the budget triggers —
so prioritization debates have a deterministic, data-backed answer instead of a
shouting match.

This policy is owned and enforced like a contract. **Review cadence and
ownership are at the bottom; read them first if you are deciding whether to
merge a feature that spends budget.**

## The four SLOs

| # | SLO | SLI | Initial target (28-day window) |
|---|-----|-----|-------------------------------|
| S1 | **API availability** | Ratio of requests served without HTTP `5xx` | **99.9%** good (allowed error budget ~0.1%) |
| S2 | **API latency p95** | p95 of server-side handler duration across all public HTTP requests | **≤ 1000 ms** (budget: 5% of requests may exceed) |
| S3 | **Payout (release) success rate** | `released` settlements ÷ all terminal settlements (`released` + `refunded` + `disputed`) | **≥ 99.5%** good (allowed ~0.5% non-released) |
| S4 | **Event-processing lag** | p95 of time since the most recent escrow event was persisted (`event_listener_processing_lag_seconds`) | **≤ 5 min** (budget: 5% of samples may exceed) |

> Targets are **initial proposals**, to be ratified in the first SLO review
> (below). They are deliberately conservative so the burn policy isn't tripped
> by noise on day one. Ratification edits only this table + the matching
> Prometheus rule constants.

## Definition of "good" (SLI definitions)

- **S1 availability:** a request is *good* if the response status is **not 5xx**
  (4xx are client-caused and excluded). Source:
  `http_server_duration_milliseconds_count` (OTel HTTP auto-instrumentation).
- **S2 latency:** the p95 over the histogram
  `http_server_duration_milliseconds_bucket`. *Good* = delivered under 1000 ms.
- **S3 payout:** computed from the business funnel counter
  `amana_trades_total{event="released"|"refunded"|"disputed"}`. *Good* = the
  escrow funds were released to the seller (`event="released"`).
- **S4 event lag:** `event_listener_processing_lag_seconds` gauge, sampled on
  each health check. *Good* = ≤ 300 seconds.

All SLIs are computed as **Prometheus recording rules** in
[`infra/prometheus/slo-recording-rules.yml`](../infra/prometheus/slo-recording-rules.yml)
from these raw metrics, emitting `slo:good_ratio` and `slo:error_budget_*`
series per SLO.

## Error budgets

Each SLO has an error budget = `1 - target` over the window:

| SLO | Target | Budget |
|-----|--------|--------|
| S1 availability | 99.9% | 0.10% of requests may be 5xx |
| S2 latency p95 | 1000 ms | 5% of requests may exceed 1 s |
| S3 payout | 99.5% | 0.5% of settlements may be non-released |
| S4 event lag p95 | 5 min | 5% of lag samples may exceed 5 min |

Burning the budget has **consequences** (below), so teams treat the budget like
a resource: you may spend it, but you must reconcile it in review.

## Burn-rate alerting (fast + slow windows)

We alert on **burn rate**, not absolute error budget, so a fast, localized
regression pages immediately while a slow chronic leak files tickets.

Rules in [`infra/prometheus/slo-alerting-rules.yml`](../infra/prometheus/slo-alerting-rules.yml):

- **Fast burn (page):** error-budget consumed at a rate that would exhaust the
  whole budget in `<= 1 hour` (1200x) over a **1-hour** window → page on-call.
- **Slow burn (ticket):** budget exhausted over the entire 28-day window at a
  rate that would drain it in `<= 3 days` (≈9.3x) over a **6-hour** window →
  file a ticket for same-day triage.

| Burn window | Ratio | Alert routing |
|-------------|-------|---------------|
| 1 hour | ≥ 1.2e3× (exhaust in ≤ 1 h) | **page** |
| 6 hours | ≥ 9.3× (exhaust in ≤ 3 days) | **ticket** |

`docs/alert-routing-policy.md` governs how page/ticket alerts are routed and
deduplicated; the SLO alerts reuse that pipeline via Alertmanager.

## What burning the budget triggers

The **primary** response to a burned budget is to **stop spending**:

1. **Freeze non-essential feature work on the affected component.** No new
   feature PRs that increase risk on the component under the SLO until the
   budget is restored or the freeze is recused.
2. **Reliability sprint.** The owning team schedules a focused sprint to (a)
   diagnose the burn, (b) make a fix, and (c) add a regression guard. A burned
   budget is a *blocking* signal, not a nice-to-have.
3. **Severity escalation:** page-level burn → treated as an incident per
   [`docs/runbooks/incident-response.md`](runbooks/incident-response.md).
   Ticket-level burn → triaged same/next business day.
4. **Postmortem** when the budget is exhausted (100% consumed): mandatory
   [`docs/postmortems/`](postmortems/) with corrective actions tracked to
   closure.

### Budget health thresholds

| Budget consumed | Action |
|-----------------|--------|
| < 60% | Normal — proceed. |
| 60–90% | Trend reviewed in the weekly SLO snapshot; plan mitigation. |
| 90–100% | **Feature freeze** on the affected component + reliability sprint teed up. |
| 100% (exhausted) | **Incident + postmortem**; freeze until budget restored. |

## Weekly SLO snapshot

Automated every Monday by
[`.github/workflows/slo-snapshot.yml`](../.github/workflows/slo-snapshot.yml),
running [`scripts/slo-snapshot.ts`](../scripts/slo-snapshot.ts) to append one
JSON row per SLO to `slo-snapshots/slo-snapshot.jsonl`:

```json
{"ts":"2026-08-31T00:00:00Z","slo":"S1","good_ratio":0.9994,"budget_consumed":0.42,"window":"28d"}
```

This is the source of truth for the review meeting and for the trend panels on
the SLO dashboard (see `docs/dashboards.md`).

## Review cadence and ownership

- **Weekly:** the SLO snapshot data is reviewed (budget consumption by SLO,
  burn-rate alerts fired, freeze decisions).
- **Monthly:** the **SLO review meeting** ratifies:
  - target numbers (locked to real measurements, not guesses),
  - per-SLO **owners** and their on-call/escalation path,
  - the freeze list and any active reliability sprints.
- Minutes of each review are appended to
  [`docs/slo-review-log.md`](slo-review-log.md) and linked from PRs that change
  SLO targets or burn policy.

### Ownership

| SLO | Primary owner | Escalation |
|-----|---------------|------------|
| S1 availability | Platform / backend team | on-call per `docs/runbooks/on-call.md` |
| S2 latency | Backend team | on-call |
| S3 payout | Backend + contract team | on-call (fund movement) |
| S4 event lag | Indexer / backend | ticket, page at fast burn |

Owners approve changes that touch their SLO's SLI or target. The **error
budget is the arbiter**: if a change would overrun the budget, the owner must
negotiate a freeze/sprint, not silently let it slip.

## Changing an SLO

Any change to a target, SLI definition, or burn threshold is a **policy change**
requiring: (1) owner sign-off, (2) a PR updating `docs/slo.md` + the matching
Prometheus rule constants, (3) note in the next monthly review minutes. Never
change a target at the moment of a burn to dodge the consequences.

## Staged fault verification

Burn alerts must fire correctly under fault. The staging test harness
('[`scripts/slo-fault-test.sh`](../scripts/slo-fault-test.sh)) generates
synthetic 5xx errors, throttled latency, and forced event-listener lag, then
asserts the `slo:error_budget_*` series trend and the fast/slow burn alerts
fire.

The harness runs in two modes:

- **Rule-only (default, no Prometheus):** lints the recording + alerting rules
  and asserts every burn-window ratio the alerts reference is actually defined
  in the recording rules — this is what catches a missing short-window series
  (e.g. S1/S2's 1h/6h ratios) before it silently disables an alert in prod.
- **Full round-trip** (`PROMETHEUS_URL=... ./scripts/slo-fault-test.sh`):
  pushes synthetic fault waves into the raw SLI metrics via remote-write and
  confirms the fast/slow burn alerts fire and resolve.

It is exercised in CI on any PR that touches the Prometheus SLO rules
(`.github/workflows/slo-fault-test.yml`) and in the fault-demo runbook
referenced in the monthly review.

## Related

- `docs/dashboards.md` — golden signals + SLO trend panels.
- `docs/alert-routing-policy.md` — page vs ticket routing for alerts.
- `infra/prometheus/slo-recording-rules.yml`, `infra/prometheus/slo-alerting-rules.yml`
  — the Prometheus rules (config-as-code).
- `scripts/slo-fault-test.sh` + `.github/workflows/slo-fault-test.yml` — staged
  fault verification of the burn alerts.
- `docs/slo-review-log.md` — running minutes of SLO reviews.
