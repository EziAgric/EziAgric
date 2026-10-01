#!/usr/bin/env node
// Renders the nightly k6 trend history (JSON lines appended by
// scripts/k6-budget-report.mjs --trend-file) into a Markdown dashboard with
// a p95 sparkline per endpoint (Issue #237).
//
// Usage: node scripts/k6-trend-dashboard.mjs <trend.jsonl> <out.md> [--last 30]

import fs from 'node:fs';

const [, , trendFile, outFile, flag, lastArg] = process.argv;
if (!trendFile || !outFile) {
  console.error('Usage: k6-trend-dashboard.mjs <trend.jsonl> <out.md> [--last N]');
  process.exit(2);
}
const last = flag === '--last' ? Number(lastArg) : 30;

const entries = fs.existsSync(trendFile)
  ? fs
      .readFileSync(trendFile, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .slice(-last)
  : [];

const BARS = '▁▂▃▄▅▆▇█';
function sparkline(values) {
  const nums = values.filter((v) => typeof v === 'number');
  if (nums.length === 0) return 'n/a';
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return values
    .map((v) => {
      if (typeof v !== 'number') return ' ';
      if (max === min) return BARS[0];
      return BARS[Math.round(((v - min) / (max - min)) * (BARS.length - 1))];
    })
    .join('');
}

const endpoints = [...new Set(entries.flatMap((e) => Object.keys(e.endpoints || {})))].sort();

const lines = [
  '# k6 nightly performance trends',
  '',
  `Last ${entries.length} run(s). Generated ${new Date().toISOString()}.`,
  'Budgets: `k6/budgets.json` · Rationale: `docs/performance-budgets.md`',
  '',
  '| Endpoint | p95 trend | latest p95 | latest p99 | latest errors | latest rps |',
  '|---|---|---|---|---|---|',
];

for (const name of endpoints) {
  const series = entries.map((e) => e.endpoints?.[name]?.p95);
  const latest = entries[entries.length - 1]?.endpoints?.[name] || {};
  const f = (n, d = 1) => (typeof n === 'number' ? n.toFixed(d) : 'n/a');
  lines.push(
    `| \`${name}\` | \`${sparkline(series)}\` | ${f(latest.p95)}ms | ${f(latest.p99)}ms | ` +
      `${typeof latest.errorRate === 'number' ? (latest.errorRate * 100).toFixed(2) + '%' : 'n/a'} | ${f(latest.rps)} |`,
  );
}

lines.push('', '## Runs', '', '| When | Commit | Breaches |', '|---|---|---|');
for (const e of [...entries].reverse()) {
  lines.push(`| ${e.at} | ${e.sha ? '`' + String(e.sha).slice(0, 7) + '`' : '—'} | ${e.breaches} |`);
}

fs.writeFileSync(outFile, lines.join('\n') + '\n');
console.log(`Wrote ${outFile} (${entries.length} runs, ${endpoints.length} endpoints)`);
