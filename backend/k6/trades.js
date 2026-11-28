// k6 load test for backend trade read endpoints
// Run with: k6 run backend/k6/trades.js
// Or with environment overrides:
// BASE_URL=https://api.example.com TOKEN=your_jwt_token k6 run backend/k6/trades.js

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const TOKEN = __ENV.TOKEN || '';
const VUS = __ENV.VUS || 100;
const DURATION = __ENV.DURATION || '60s';

// Custom metrics
const errorRate = new Rate('errors');
const getTradesLatency = new Trend('GET /trades latency');
const getTradeByIdLatency = new Trend('GET /trades/:id latency');

// Test configuration
export const options = {
  scenarios: {
    trades_load_test: {
      executor: 'constant-vus',
      vus: parseInt(VUS),
      duration: DURATION,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<200'], // 200ms p95 threshold
    errors: ['rate<0.01'], // Less than 1% error rate
  },
};

const headers = {
  'Content-Type': 'application/json',
  ...(TOKEN && { Authorization: `Bearer ${TOKEN}` }),
};

export default function () {
  // Test GET /trades (list trades with pagination)
  group('GET /trades', () => {
    const url = `${BASE_URL}/api/trades?page=1&pageSize=20`;
    const res = http.get(url, { headers });
    
    getTradesLatency.add(res.timings.duration);
    
    const success = check(res, {
      'status is 200': (r) => r.status === 200,
      'response has trades array': (r) => {
        try {
          const body = JSON.parse(r.body);
          return Array.isArray(body.data) || Array.isArray(body.trades);
        } catch {
          return false;
        }
      },
    });
    
    errorRate.add(!success);
  });

  sleep(0.1);

  // Test GET /trades/:id (get single trade by ID)
  // Using a set of sample trade IDs for realistic testing
  const sampleTradeIds = ['TRD001', 'TRD002', 'TRD003', 'TRD004', 'TRD005'];
  const tradeId = sampleTradeIds[Math.floor(Math.random() * sampleTradeIds.length)];
  
  group('GET /trades/:id', () => {
    const url = `${BASE_URL}/api/trades/${tradeId}`;
    const res = http.get(url, { headers });
    
    getTradeByIdLatency.add(res.timings.duration);
    
    const success = check(res, {
      'status is 200 or 404': (r) => r.status === 200 || r.status === 404,
      'response is valid JSON': (r) => {
        try {
          JSON.parse(r.body);
          return true;
        } catch {
          return false;
        }
      },
    });
    
    errorRate.add(!success);
  });

  sleep(0.1);
}

// Summary handler for CI artifact generation
export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'summary.json': JSON.stringify(data, null, 2),
  };
}

// Simple text summary for console output
function textSummary(data, opts) {
  const indent = opts.indent || '';
  let output = `${indent}Load Test Summary\n`;
  output += `${indent}==================\n`;
  
  if (data.metrics.http_req_duration) {
    const p95 = data.metrics.http_req_duration['values']['p(95)'];
    output += `${indent}p95 latency: ${p95?.toFixed(2)}ms\n`;
  }
  
  if (data.metrics.errors) {
    const errorRateValue = data.metrics.errors['values']['rate'];
    output += `${indent}Error rate: ${(errorRateValue * 100).toFixed(2)}%\n`;
  }
  
  return output;
}