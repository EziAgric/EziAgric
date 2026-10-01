# Performance Budgets (k6)

Issue #237. Performance budgets are checked in CI, so a regression can't merge unnoticed.

| Piece | Location |
|---|---|
| Budgets (source of truth) | [`k6/budgets.json`](../k6/budgets.json) |
| Threshold builder | [`k6/lib/budgets.js`](../k6/lib/budgets.js) |
| PR smoke scenario | [`k6/smoke.js`](../k6/smoke.js) |
| Nightly full-load scenario | [`k6/load-test.js`](../k6/load-test.js) |
| Diff report / trend writer | [`scripts/k6-budget-report.mjs`](../scripts/k6-budget-report.mjs) |
| Trend dashboard | [`scripts/k6-trend-dashboard.mjs`](../scripts/k6-trend-dashboard.mjs) → `perf-trends` branch `README.md` |
| Workflow | [`.github/workflows/perf-budgets.yml`](../.github/workflows/perf-budgets.yml) |

## How the gate works

1. Each k6 request carries an `endpoint` tag. `buildThresholds(profile)` turns every
   budget entry into k6 thresholds on `http_req_duration{endpoint:…}` (p95, p99),
   `http_req_failed{endpoint:…}` (error rate) and `http_reqs{endpoint:…}` (throughput
   floor, `rate>=min_rps`).
2. When a threshold is breached, `k6 run` exits non-zero. `k6-budget-report.mjs`
   then re-evaluates the summary and writes a Markdown table with the measured value,
   the budget and the delta for each endpoint. The table goes to the job summary and to
   a sticky PR comment.
3. The `k6 smoke budgets` job fails, and this blocks the merge once it is a
   required check (see "Rollout" below).

### Profiles

| Profile | Trigger | Target | Load | Endpoints |
|---|---|---|---|---|
| `smoke` | PRs touching `backend/src/{routes,controllers,services,middleware,lib}`, `app.ts`, `schema.prisma`, `k6/**` | Ephemeral backend + Postgres + Redis in the runner | 5 VUs × 2 min (constant) | Read hot paths only (no live Stellar RPC needed) |
| `full` | Nightly 02:30 UTC, or manual | Staging (`STAGING_BASE_URL`) | `loadOptions` ramp to 20 VUs | Full trade lifecycle |

The smoke job has `timeout-minutes: 10`. Installing and booting the backend takes
about 3–4 minutes, and the k6 run is 2 minutes, so the job stays under the
10-minute target.

## Budget rationale per endpoint

These budgets are set from the user-facing SLOs in [`slo.md`](./slo.md). The global
defaults are p95 < 500 ms, p99 < 1 s and error rate < 1%. Each endpoint then gets its
own budget, tighter or looser than the global one depending on what the endpoint does.

| Endpoint | p95 | p99 | Max errors | Floor smoke / full | Rationale |
|---|---|---|---|---|---|
| `GET /health/live` | 50 ms | 100 ms | 0% | 2 / 5 rps | Liveness does no I/O. Kubelet probes it with a 1 s timeout, so anything above tens of ms means the event loop is blocked. Any error here means the process is unhealthy. |
| `GET /health/ready` | 150 ms | 300 ms | 0.1% | 1 / 2 rps | Pings Postgres and Redis. Readiness has a 1 s probe timeout, so we keep a 3× safety margin on p99. |
| `GET /trades?page=1&limit=10` | 300 ms | 600 ms | 1% | 2 / 5 rps | This is the most frequent authenticated read (dashboard landing). It is a single indexed, paginated query. It is below the 500 ms global budget because the frontend chains it with other calls. |
| `GET /trades/stats` | 400 ms | 800 ms | 1% | 1 / 3 rps | This is an aggregate query over the caller's trades, so it gets more headroom than the list query. It is still inside the global p95 budget. |
| `POST /trades` | 800 ms | 1.5 s | 1% | — / 2 rps | Builds an unsigned Soroban XDR, which includes an RPC simulate round-trip to Stellar. Testnet RPC p95 is roughly 400–500 ms, so the budget allows RPC time plus our own overhead. Only measured nightly. |
| `POST /trades/:id/deposit` | 800 ms | 1.5 s | 1% | — / 2 rps | Same as create: the cost is dominated by the RPC simulate call. |
| `POST /trades/:id/confirm` | 800 ms | 1.5 s | 1% | — / 2 rps | Same as create. |
| `POST /trades/:id/dispute` | 800 ms | 1.5 s | 1% | — / 2 rps | Same as create, plus the dispute rate limiter. |

Throughput floors are set well below what the scenario generates. A 5-VU smoke run
with a 0.5 s sleep produces about 6–8 iterations per second, and every smoke endpoint
is hit once per iteration. A floor breach therefore means requests are queueing or
timing out. It does not mean the load generator was too small.

### Changing a budget

- Change `k6/budgets.json` **and** the table above in the same PR, and give the
  reason. A budget change without a rationale should be rejected in review.
- Don't loosen a budget just to get a PR through. If a regression is intended, for
  example a new feature that adds unavoidable work, loosen the budget in its own
  commit and link the capacity note that justifies it.
- `K6_BUDGET_SCALE` is for experiments only. Never set it in the workflow.

## Proving the gate works (deliberate slowdown)

Run **Actions → k6 Performance Budgets → Run workflow** with
`mode = slowdown-experiment` and `inject_latency_ms = 750`. The run does the following:

1. The backend starts normally.
2. `scripts/k6-latency-proxy.mjs` starts in front of it on `:4100` and adds 750 ms to
   every request.
3. k6 runs the smoke scenario against the proxy.
4. The job **passes only if the budget gate fails**. If the budgets survive injected
   latency, they are too loose, and the job errors so someone tightens them.

Repeat this experiment whenever budgets are loosened.

## Nightly trends

The nightly job appends one JSON line per run to `full.jsonl` on the `perf-trends`
branch. It then regenerates `perf-trends/README.md`, which shows a p95 sparkline per
endpoint and a run log, and copies that dashboard into the job summary.
Artifacts are kept for 90 days.

**Triage:** when a nightly breach occurs, the on-call engineer checks the dashboard,
bisects using the commit SHAs in the run log, and records the outcome in the capacity
notes below. The outcome is one of: fix, accepted with budget change, or environment
noise.

## Capacity notes

Append an entry after each notable nightly result or budget change.

| Date | Profile | Observation | Action |
|---|---|---|---|
| 2026-09-29 | — | Budgets introduced (Issue #237). No baseline recorded yet. | Capture the first 7 nightly runs, then revisit the floors against the observed rps. |

## Rollout

1. Merge this workflow. The first PRs will show the report as a normal check.
2. After about a week of green nightly runs, add `k6 smoke budgets` to the required
   status checks in branch protection (see [`branch-protection-policy.md`](./branch-protection-policy.md)).
3. Configure the `staging` environment secrets `STAGING_BASE_URL` and
   `STAGING_K6_JWT_SECRET`. The second one must match the staging backend's
   `JWT_SECRET`, and it should be a dedicated load-test secret where possible.
