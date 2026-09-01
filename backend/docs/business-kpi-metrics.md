# Business KPI Metrics Catalog

> Addresses issue #232 — product funnel analytics instrumentation.

## Overview

The backend exposes two classes of metrics via the OTel → Prometheus pipeline
(scraped on `PROMETHEUS_PORT`, default **9464**):

1. **Infrastructure / Stellar metrics** — already defined in `lib/metrics.ts`
   (Stellar RPC call latency, transaction outcomes, reconciliation drift, etc.)
2. **Product-funnel / KPI metrics** (this document) — cardinality-safe counters
   and histograms covering the escrow trade lifecycle so leadership, on-call,
   and roadmap decisions have quantitative product health visibility.

---

## Metric Catalog

### `amana_trades_total{event}`

| Label value | Triggered by | Source |
|---|---|---|
| `created` | `TradeService.createPendingTrade()` (DB-side), also `handleTradeCreated` (on-chain confirm) | `trade.service.ts`, `eventHandlers.ts` |
| `funded` | `handleTradeFunded` on-chain event | `eventHandlers.ts` |
| `delivered` | `handleDeliveryConfirmed` on-chain event | `eventHandlers.ts` |
| `released` | `handleFundsReleased` on-chain event | `eventHandlers.ts` |
| `disputed` | `handleDisputeInitiated` on-chain event | `eventHandlers.ts` |
| `expired` | `TradeExpiryService.sweepExpiredTrades()` | `tradeExpiry.service.ts` |
| `cancelled` | (reserved for manual cancellation) | — |
| `refunded` | (reserved for explicit on-chain refund confirmation) | — |

**Funnel**: `created → funded → delivered → released` (success path)  
**Failure paths**: `created → expired`, `funded → disputed`

**Prometheus recording rule** (add to your `rules.yml`):
```yaml
# Dispute rate over trailing 1-hour window
- record: job:amana_dispute_rate:1h
  expr: |
    rate(amana_trades_total{event="disputed"}[1h])
    /
    rate(amana_trades_total{event="funded"}[1h])
```

**Dispute-spike alert** (Alertmanager):
```yaml
- alert: TradeDisputeRateSpike
  expr: job:amana_dispute_rate:1h > 0.10   # >10% dispute rate
  for: 15m
  labels:
    severity: warning
  annotations:
    summary: "Dispute rate >10% over the last hour"
    runbook: "docs/runbooks/dispute-spike.md"
```

---

### `amana_trade_time_to_fund_ms` (Histogram)

Time from a trade entering `CREATED` status to becoming `FUNDED`, in
milliseconds. Useful for tracking how quickly buyers fund their escrow after
creating a trade.

**Labels**: none (single dimension; add `network` if you run multi-network).

**Suggested SLO**: p95 < 120 000 ms (2 minutes).

---

### `amana_trade_time_to_release_ms{outcome}` (Histogram)

Time from escrow `FUNDED` to final settlement, in milliseconds.

| `outcome` label | Meaning |
|---|---|
| `released` | Funds released to seller — happy path |
| `refunded` | Funds returned to buyer — expired or dispute resolved for buyer |

**Suggested SLO**: p50 < 3 600 000 ms (1 hour), p95 < 86 400 000 ms (24 hours).

**Dashboard panel**: plot both `outcome` streams together to visualise
settlement speed split by resolution type.

---

### `amana_trade_gmv_usdc_cents` (Histogram)

Gross merchandise value per completed/released trade, expressed in **USDC
cents** (amount × 100, integer). Using cents keeps histogram bucket arithmetic
integer-safe while preserving sub-dollar precision.

**Labels**: `outcome` (same values as `time_to_release`).

**To get total GMV in USD**:
```promql
sum(increase(amana_trade_gmv_usdc_cents_sum[24h])) / 100
```

This is a *proxy* metric — it reflects the value of trades that completed
their on-chain release, which may lag the wall-clock business day. Use it
alongside `amana_trades_total{event="released"}` for a daily count + volume
report.

---

### `amana_dispute_rate_anomalies_total{outcome}` (Counter)

Incremented each time the application-level dispute-rate check detects an
anomaly (i.e., the rolling dispute rate exceeds a threshold). This is the
*detection event* counter — the actual rate calculation lives in a Prometheus
recording rule above. Pair with an Alertmanager rule to page on consecutive
detections.

---

## Cardinality Notes

All labels are **low-cardinality by design** — `event` has 8 fixed values,
`outcome` has 2. Never add `tradeId`, `buyerAddress`, or any per-entity
identifier as a label — those would explode the time-series cardinality and
make your Prometheus expensive to run. Keep entity-level detail in structured
logs instead.

---

## Verifying metrics in staging

1. Start the backend with `PROMETHEUS_PORT=9464`.
2. `curl http://localhost:9464/metrics | grep amana_trades`
3. Create, fund, and release a trade through the API.
4. Re-curl; counters should have incremented.

For the time-based histograms, look for `amana_trade_time_to_fund_ms_bucket`
and `amana_trade_time_to_release_ms_bucket` lines.

---

## Implementation files

| File | Role |
|---|---|
| `src/lib/metrics.ts` | Metric definitions and `record*` functions |
| `src/services/eventHandlers.ts` | Wires funnel counters + GMV to on-chain events |
| `src/services/trade.service.ts` | Wires `created` counter to DB-side creation |
| `src/services/tradeExpiry.service.ts` | Wires `expired` counter to the sweeper |
