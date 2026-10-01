import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { loadOptions, BASE_URL } from './options.js';
import { buildThresholds, summaryWriter } from './lib/budgets.js';
import { randomPublicKey, signToken } from './lib/auth.js';

// Nightly full-load profile (Issue #237): stages come from loadOptions,
// thresholds come from k6/budgets.json so every key endpoint is gated on its
// own p95/p99, error rate and throughput floor.
const PROFILE = 'full';

export const options = {
  ...loadOptions,
  thresholds: buildThresholds(PROFILE),
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

export const handleSummary = summaryWriter(PROFILE);

const tradeCreateTrend = new Trend('trade_create_duration');
const tradeListTrend = new Trend('trade_list_duration');
const depositTrend = new Trend('trade_deposit_duration');
const confirmTrend = new Trend('trade_confirm_duration');
const disputeTrend = new Trend('trade_dispute_duration');
const errorRate = new Rate('errors');
const tradesCreated = new Counter('trades_created');

export default function () {
  const buyerWallet = randomPublicKey();
  const sellerWallet = randomPublicKey();
  const token = signToken(buyerWallet);
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  group('Trade Lifecycle', function () {
    group('Create Trade', function () {
      const payload = JSON.stringify({
        sellerAddress: sellerWallet,
        amountUsdc: '100.00',
        buyerLossBps: 5000,
        sellerLossBps: 5000,
      });

      const res = http.post(`${BASE_URL}/trades`, payload, { headers, tags: { endpoint: 'trades_create' } });
      const isOk = check(res, {
        'create trade status 201': (r) => r.status === 201,
        'create trade has tradeId': (r) => r.json('tradeId') !== undefined,
        'create trade has unsignedXdr': (r) => r.json('unsignedXdr') !== undefined,
      });
      tradeCreateTrend.add(res.timings.duration);
      errorRate.add(!isOk);
      if (isOk) tradesCreated.add(1);
    });

    sleep(1);

    group('List Trades', function () {
      const res = http.get(`${BASE_URL}/trades?page=1&limit=10`, { headers, tags: { endpoint: 'trades_list' } });
      const isOk = check(res, {
        'list trades status 200': (r) => r.status === 200,
      });
      tradeListTrend.add(res.timings.duration);
      errorRate.add(!isOk);
    });

    sleep(1);

    group('Deposit', function () {
      const payload = JSON.stringify({});
      const res = http.post(`${BASE_URL}/trades/4294967297/deposit`, payload, { headers, tags: { endpoint: 'trades_deposit' } });
      const isOk = check(res, {
        'deposit status 200': (r) => r.status === 200,
        'deposit has unsignedXdr': (r) => r.json('unsignedXdr') !== undefined,
      });
      depositTrend.add(res.timings.duration);
      errorRate.add(!isOk);
    });

    sleep(1);

    group('Confirm Delivery', function () {
      const payload = JSON.stringify({});
      const res = http.post(`${BASE_URL}/trades/4294967297/confirm`, payload, { headers, tags: { endpoint: 'trades_confirm' } });
      const isOk = check(res, {
        'confirm delivery status 200': (r) => r.status === 200,
        'confirm delivery has unsignedXdr': (r) => r.json('unsignedXdr') !== undefined,
      });
      confirmTrend.add(res.timings.duration);
      errorRate.add(!isOk);
    });

    sleep(1);

    group('Initiate Dispute', function () {
      const payload = JSON.stringify({
        reason: 'Goods not delivered on time',
        category: 'delivery_issue',
      });
      const res = http.post(`${BASE_URL}/trades/4294967297/dispute`, payload, { headers, tags: { endpoint: 'trades_dispute' } });
      const isOk = check(res, {
        'dispute status 200': (r) => r.status === 200,
        'dispute has unsignedXdr': (r) => r.json('unsignedXdr') !== undefined,
      });
      disputeTrend.add(res.timings.duration);
      errorRate.add(!isOk);
    });
  });

  group('Health Check', function () {
    const live = http.get(`${BASE_URL}/health/live`, { tags: { endpoint: 'health_live' } });
    check(live, {
      'live status 200': (r) => r.status === 200,
    });
    const ready = http.get(`${BASE_URL}/health/ready`, { tags: { endpoint: 'health_ready' } });
    check(ready, {
      'ready status 200': (r) => r.status === 200,
    });
  });

  group('Trade Stats', function () {
    const res = http.get(`${BASE_URL}/trades/stats`, { headers, tags: { endpoint: 'trades_stats' } });
    check(res, {
      'trade stats status 200': (r) => r.status === 200,
    });
  });

  sleep(2);
}
