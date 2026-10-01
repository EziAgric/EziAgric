import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL } from './options.js';
import { authHeaders, randomPublicKey } from './lib/auth.js';
import { buildThresholds, summaryWriter } from './lib/budgets.js';

// PR smoke-scale run (Issue #237). Small, fixed load against read hot paths
// that work without a live Stellar RPC, so it is deterministic in CI and
// finishes well under the 10 minute budget. Write paths (create/deposit/
// confirm/dispute) are covered by the nightly full run against staging.
const PROFILE = 'smoke';

export const options = {
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: Number(__ENV.K6_SMOKE_VUS || 5),
      duration: __ENV.K6_SMOKE_DURATION || '2m',
      gracefulStop: '10s',
    },
  },
  thresholds: buildThresholds(PROFILE),
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

export default function () {
  const headers = authHeaders(randomPublicKey());

  const live = http.get(`${BASE_URL}/health/live`, { tags: { endpoint: 'health_live' } });
  check(live, { 'live 200': (r) => r.status === 200 });

  const ready = http.get(`${BASE_URL}/health/ready`, { tags: { endpoint: 'health_ready' } });
  check(ready, { 'ready 200': (r) => r.status === 200 });

  const list = http.get(`${BASE_URL}/trades?page=1&limit=10`, {
    headers,
    tags: { endpoint: 'trades_list' },
  });
  check(list, { 'list trades 200': (r) => r.status === 200 });

  const stats = http.get(`${BASE_URL}/trades/stats`, {
    headers,
    tags: { endpoint: 'trades_stats' },
  });
  check(stats, { 'trade stats 200': (r) => r.status === 200 });

  sleep(0.5);
}

export const handleSummary = summaryWriter(PROFILE);
