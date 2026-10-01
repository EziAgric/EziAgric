// Builds k6 thresholds from k6/budgets.json (Issue #237).
//
// Every request must be tagged with `{ endpoint: '<name>' }` so the
// per-endpoint sub-metrics below can be evaluated. A breach of any threshold
// makes `k6 run` exit non-zero, which is what blocks the merge in CI.
//
// K6_BUDGET_SCALE (default 1) multiplies latency budgets. It exists only so
// the gate can be exercised deliberately; never raise it to "fix" a breach.

import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

// open() resolves relative to this module's directory.
const budgets = JSON.parse(open('../budgets.json'));

export function loadBudgets() {
  return budgets;
}

export function endpointsFor(profile) {
  return Object.entries(budgets.endpoints)
    .filter(([, b]) => !b.profiles || b.profiles.includes(profile))
    .map(([name]) => name);
}

export function buildThresholds(profile) {
  const scale = Number(__ENV.K6_BUDGET_SCALE || 1);
  const g = budgets.global;
  const thresholds = {
    http_req_duration: [`p(95)<${g.p95_ms * scale}`, `p(99)<${g.p99_ms * scale}`],
    http_req_failed: [`rate<=${g.max_error_rate}`],
  };

  for (const name of endpointsFor(profile)) {
    const b = budgets.endpoints[name];
    const tag = `{endpoint:${name}}`;
    thresholds[`http_req_duration${tag}`] = [
      `p(95)<${b.p95_ms * scale}`,
      `p(99)<${b.p99_ms * scale}`,
    ];
    thresholds[`http_req_failed${tag}`] = [`rate<=${b.max_error_rate}`];
    const floor = (b.min_rps || {})[profile] || 0;
    if (floor > 0) {
      thresholds[`http_reqs${tag}`] = [`rate>=${floor}`];
    }
  }
  return thresholds;
}

// Writes a machine-readable summary consumed by scripts/k6-budget-report.mjs
// alongside the normal console output.
export function summaryWriter(profile) {
  return function handleSummary(data) {
    const out = __ENV.K6_SUMMARY_PATH || `k6-summary-${profile}.json`;
    return {
      [out]: JSON.stringify({ profile, generatedAt: new Date().toISOString(), metrics: data.metrics }, null, 2),
      stdout: textSummary(data, { indent: ' ', enableColors: true }),
    };
  };
}
