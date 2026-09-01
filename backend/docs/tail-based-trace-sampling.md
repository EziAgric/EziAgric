# Tail-Based Trace Sampling for Production Cost Control

> Addresses issue #231.

## Problem

Without a sampling strategy, OTel's default is 100% trace capture. For a
production service handling thousands of requests/hour, this makes trace
storage prohibitively expensive and drowns high-signal traces (errors,
slow payout paths) in a sea of identical healthy-path traces.

## Strategy

`src/config/tracing.ts` implements a `TailBasedSampler` class that is wired
into the OTel `NodeSDK` as its `sampler`. It applies four ordered rules to
each span:

### Rule priority (first match wins)

| Priority | Condition | Decision | Rationale |
|---|---|---|---|
| 1 | Route matches `NEVER_SAMPLE_ROUTE_PATTERNS` (`/health`, `/metrics`, `/api/docs`) | Drop | Zero diagnostic value, high volume |
| 2 | Route matches `HIGH_VALUE_ROUTE_PATTERNS` (release, deposit, dispute, treasury, admin streams) | Always keep (100%) | Every payout/dispute trace must be retainable for incident investigation |
| 3 | `http.status_code >= 400` or `error === true` | Always keep (100%) | Any failing request is diagnostic |
| 4 | Route matches a `TRACE_ROUTE_OVERRIDES` prefix key | Per-override rate | Ops tuning without a deploy |
| 5 | All other healthy traffic | `TRACE_BASELINE_RATE` (default **10%**) | Controls storage cost |

### Terminology note

True *tail sampling* — inspecting the full completed trace before deciding —
requires a collector-side processor (e.g.
[OTel Collector `tail_sampling` processor](https://github.com/open-telemetry/opentelemetry-collector-contrib/tree/main/processor/tailsamplingprocessor)).
The `TailBasedSampler` here is a *head-based approximation*: it makes the
decision at span-start time using attributes already available (URL, parent
status). It closely approximates tail behaviour for the most important cases:
errors and high-value routes are always kept; healthy baseline traffic is
sampled down.

For a true tail-sampler in a multi-instance production deployment, deploy an
OTel Collector with `tail_sampling` configured to route all spans through
before exporting to Jaeger/Zipkin, and set `TRACE_BASELINE_RATE=1.0` in the
SDK (let the collector make the final drop decision).

---

## Environment variable configuration

All values can be changed without a code deploy:

| Variable | Default | Description |
|---|---|---|
| `TRACE_BASELINE_RATE` | `0.1` | Fraction (0–1) of healthy traffic to sample. 0.1 = 10%. |
| `TRACE_SLOW_THRESHOLD_MS` | `2000` | Spans slower than this (ms) are always kept. |
| `TRACE_ROUTE_OVERRIDES` | `{}` | JSON map of route-substring → rate, e.g. `{"\/wallet":0.2}` |

### Example: reduce cost further in production

```bash
TRACE_BASELINE_RATE=0.02          # sample 2% of healthy traffic
TRACE_SLOW_THRESHOLD_MS=1000      # keep spans >1s
TRACE_ROUTE_OVERRIDES='{"\/stellar\/fees":0.01,"\/users":0.05}'
```

### Example: 100% capture for debugging a specific route

```bash
TRACE_ROUTE_OVERRIDES='{"\/trades\/release":1.0}'
```

---

## Cost projection (illustrative)

Assumptions: 10 000 requests/hour, 3 spans per request, Jaeger with 10 days
retention.

| Scenario | Spans/hour | Spans/day | Spans retained (10d) |
|---|---|---|---|
| No sampling (100%) | 30 000 | 720 000 | 7 200 000 |
| Baseline 10% + errors 100% | ~5 000 | ~120 000 | ~1 200 000 |
| Baseline 2% + errors 100% | ~3 200 | ~77 000 | ~770 000 |

At Jaeger's roughly 1–2 KB/span in storage, the 10% baseline reduces storage
from ~15 GB to ~2.5 GB per 10-day window at 10K req/hr. Tune
`TRACE_BASELINE_RATE` based on your observed request rate and storage budget.

---

## Incident drill verification

To confirm sampled spans answer real incident questions:

1. Inject a fault (e.g. set `JAEGER_ENDPOINT` to a dev instance, then call `POST /trades/:id/release` with an invalid XDR).
2. Open Jaeger UI and search by `service=amana-backend, http.status_code=500`.
3. Verify the failing span appears (rule 3 — error always kept).
4. Call `GET /health` and verify it does *not* appear (rule 1 — health never sampled).
5. Repeat for a `POST /trades/:id/deposit` success: it should always appear (rule 2).

---

## High-value routes kept at 100%

Defined in `config/tracing.ts` as `HIGH_VALUE_ROUTE_PATTERNS`:

- `/trades/:id/release` — escrow fund release
- `/trades/:id/deposit` — escrow fund lock
- `/trades/:id/dispute` — dispute initiation
- `/trades/:id/confirm` — delivery confirmation
- `/escrow/*` — any escrow sub-route
- `/treasury/*` — treasury management
- `/admin/streams/*` — admin stream operations
- `/admin/contract/*` — admin contract governance

To add a new high-value route, add a `RegExp` to `HIGH_VALUE_ROUTE_PATTERNS`
in `src/config/tracing.ts`.

---

## Files changed

| File | Change |
|---|---|
| `src/config/tracing.ts` | Added `TailBasedSampler`, `getSampler()`, env config loading; wired sampler into `NodeSDK` |
| `src/__tests__/tracing.sampler.test.ts` | Unit tests for sampler rule coverage |
| `docs/tail-based-trace-sampling.md` | This document |
