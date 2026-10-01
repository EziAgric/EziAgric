# k6 Load Testing Suite

Load testing scripts for Amana backend endpoints and Stellar submission simulation.

## Prerequisites

- [k6](https://k6.io/docs/get-started/installation/) installed

## Scripts

### `load-test.js`
Simulates the full trade lifecycle under concurrent load:
- Create trade
- List trades
- Build deposit transaction
- Confirm delivery
- Initiate dispute

Run:
```bash
k6 run k6/load-test.js
```

### `smoke.js`
PR smoke-scale run (5 VUs × 2 min) over read hot paths, gated by the
per-endpoint budgets in `budgets.json`. Runs automatically in
`.github/workflows/perf-budgets.yml` on PRs touching backend hot paths.

Run:
```bash
BASE_URL=http://localhost:4000 K6_JWT_SECRET=<backend JWT_SECRET> k6 run k6/smoke.js
node scripts/k6-budget-report.mjs --summary k6-summary-smoke.json --profile smoke
```

### Performance budgets

`budgets.json` defines p95/p99, error rate and throughput floor per endpoint.
`lib/budgets.js` turns them into k6 thresholds, so `k6 run` exits non-zero on
a breach. Every request must carry an `endpoint` tag matching a key in
`budgets.json`. See `docs/performance-budgets.md` for rationale, the nightly
trend dashboard and the deliberate-slowdown experiment.

### `stellar-sim.js`
Simulates Stellar RPC submissions as the backend would experience them:
- Account lookups
- Transaction simulation
- Transaction submission
- Transaction status polling
- Stellar fees endpoint

Run:
```bash
k6 run k6/stellar-sim.js
```

### Custom Options

Set environment variables to configure:
```bash
BASE_URL=http://localhost:3001 STELLAR_RPC_URL=https://soroban-testnet.stellar.org k6 run k6/load-test.js
```

### Options

- `loadOptions` - Standard load test (ramp up to 20 users)
- `soakOptions` - Endurance/soak test (5 users for 20 minutes)
- `stressOptions` - Stress test (ramp up to 200 users)

Modify `options.js` to change stages. Thresholds for `load-test.js` and
`smoke.js` come from `budgets.json`. `load-test.js` now signs real HS256 JWTs
(`lib/auth.js`), so set `K6_JWT_SECRET` to the target backend's `JWT_SECRET`.
