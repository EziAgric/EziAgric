#!/usr/bin/env node
// k6 performance budget report (Issue #237).
//
// Reads a k6 summary written by k6/lib/budgets.js (handleSummary) and
// compares every tagged endpoint against k6/budgets.json. Prints a Markdown
// table (suitable for $GITHUB_STEP_SUMMARY / a PR comment) showing measured
// vs budget and the delta, and exits 1 if any budget is breached.
//
// Optionally appends one JSON line per run to a trend file so nightly runs
// can be charted over time (see scripts/k6-trend-dashboard.mjs).
//
// Usage:
//   node scripts/k6-budget-report.mjs --summary k6-summary-smoke.json \
//     [--budgets k6/budgets.json] [--profile smoke] [--output report.md] \
//     [--trend-file perf-trends/full.jsonl] [--sha <commit>] [--no-fail]

import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = { budgets: 'k6/budgets.json', fail: true };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-fail') args.fail = false;
    else if (a.startsWith('--')) args[a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
  }
  if (!args.summary) {
    console.error('Missing --summary <k6 summary json>');
    process.exit(2);
  }
  return args;
}

const args = parseArgs(process.argv);
const budgets = JSON.parse(fs.readFileSync(args.budgets, 'utf8'));
const summary = JSON.parse(fs.readFileSync(args.summary, 'utf8'));
const profile = args.profile || summary.profile || 'smoke';
const metrics = summary.metrics || {};

function metric(name, endpoint) {
  return metrics[`${name}{endpoint:${endpoint}}`];
}

function fmt(n, unit = '') {
  if (n === undefined || n === null || Number.isNaN(n)) return 'n/a';
  return `${Number(n).toFixed(unit === '%' ? 2 : 1)}${unit}`;
}

function delta(measured, budget) {
  if (measured === undefined || budget === undefined || budget === 0) return '';
  const pct = ((measured - budget) / budget) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`;
}

const rows = [];
const breaches = [];
const trendEndpoints = {};

for (const [name, b] of Object.entries(budgets.endpoints)) {
  if (b.profiles && !b.profiles.includes(profile)) continue;

  const dur = metric('http_req_duration', name)?.values || {};
  const failed = metric('http_req_failed', name)?.values || {};
  const reqs = metric('http_reqs', name)?.values || {};

  const p95 = dur['p(95)'];
  const p99 = dur['p(99)'];
  const errRate = failed.rate;
  const rps = reqs.rate;
  const floor = (b.min_rps || {})[profile] || 0;

  const checks = [
    { label: 'p95', measured: p95, budget: b.p95_ms, ok: p95 !== undefined && p95 < b.p95_ms, unit: 'ms' },
    { label: 'p99', measured: p99, budget: b.p99_ms, ok: p99 !== undefined && p99 < b.p99_ms, unit: 'ms' },
    {
      label: 'error rate',
      measured: errRate === undefined ? undefined : errRate * 100,
      budget: b.max_error_rate * 100,
      ok: errRate !== undefined && errRate <= b.max_error_rate,
      unit: '%',
    },
  ];
  if (floor > 0) {
    checks.push({ label: 'throughput', measured: rps, budget: floor, ok: rps !== undefined && rps >= floor, unit: ' rps' });
  }

  for (const c of checks) {
    if (!c.ok) breaches.push(`${name} ${c.label}: ${fmt(c.measured, c.unit)} vs budget ${fmt(c.budget, c.unit)}`);
  }

  const status = checks.every((c) => c.ok) ? '✅' : '❌';
  rows.push(
    `| ${status} | \`${b.method} ${b.path}\` | ${fmt(p95, 'ms')} / ${b.p95_ms}ms (${delta(p95, b.p95_ms)}) | ` +
      `${fmt(p99, 'ms')} / ${b.p99_ms}ms (${delta(p99, b.p99_ms)}) | ` +
      `${fmt(errRate === undefined ? undefined : errRate * 100, '%')} / ${fmt(b.max_error_rate * 100, '%')} | ` +
      `${fmt(rps, ' rps')} / ${floor ? `≥${floor} rps` : '—'} |`,
  );

  trendEndpoints[name] = { p95, p99, errorRate: errRate, rps };
}

const lines = [
  '<!-- k6-budget-report -->',
  `## k6 performance budgets — \`${profile}\` profile`,
  '',
  breaches.length === 0
    ? '**All budgets met.**'
    : `**${breaches.length} budget breach(es) — merge blocked.** See \`docs/performance-budgets.md\` for triage.`,
  '',
  '| | Endpoint | p95 (measured / budget) | p99 (measured / budget) | Errors | Throughput |',
  '|---|---|---|---|---|---|',
  ...rows,
];

if (breaches.length > 0) {
  lines.push('', '<details><summary>Breaches</summary>', '', ...breaches.map((b) => `- ${b}`), '', '</details>');
}

const report = lines.join('\n') + '\n';
process.stdout.write(report);
if (args.output) fs.writeFileSync(args.output, report);

if (args.trendFile) {
  fs.mkdirSync(path.dirname(args.trendFile), { recursive: true });
  const entry = {
    at: summary.generatedAt || new Date().toISOString(),
    sha: args.sha || process.env.GITHUB_SHA || null,
    profile,
    breaches: breaches.length,
    endpoints: trendEndpoints,
  };
  fs.appendFileSync(args.trendFile, JSON.stringify(entry) + '\n');
}

if (breaches.length > 0 && args.fail) process.exit(1);
