#!/usr/bin/env node
/**
 * k6 budget report (issue #695).
 *
 * Reads a k6 `--summary-export` JSON and:
 *   - counts budget breaches (k6 thresholds that failed),
 *   - extracts p95/p99 per endpoint from `http_req_duration{endpoint:<name>}`
 *     sub-metrics (the test must tag requests with `endpoint` and list them in
 *     thresholds, otherwise k6 does not export them),
 *   - writes a Markdown report (job summary / PR comment),
 *   - appends one row to the JSONL trend file, and
 *   - writes Prometheus text-format metrics that the nightly job pushes to the
 *     Pushgateway for Grafana and the consecutive-breach alert.
 *
 * Exits 1 when any budget is breached so the workflow gate fails.
 *
 * Usage:
 *   node scripts/k6-budget-report.mjs --summary k6-summary-full.json --profile full \
 *     --output k6-budget-report-full.md [--trend-file perf-trends/full.jsonl] \
 *     [--sha <git sha>] [--metrics-output k6-budget-metrics-full.prom]
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    summary: { type: "string" },
    profile: { type: "string", default: "smoke" },
    output: { type: "string" },
    "trend-file": { type: "string" },
    sha: { type: "string", default: "" },
    "metrics-output": { type: "string" },
  },
});

if (!values.summary || !values.output) {
  console.error(
    "usage: k6-budget-report.mjs --summary <file> --output <md> [--profile p] [--trend-file f] [--sha s] [--metrics-output f]",
  );
  process.exit(1);
}

let summary;
try {
  summary = JSON.parse(readFileSync(values.summary, "utf8"));
} catch (err) {
  console.error(`cannot read k6 summary ${values.summary}: ${err.message}`);
  process.exit(1);
}

const metrics = summary.metrics ?? {};

const breaches = [];
for (const [name, metric] of Object.entries(metrics)) {
  for (const [expr, result] of Object.entries(metric.thresholds ?? {})) {
    if (result.ok === false) breaches.push(`${name}: ${expr}`);
  }
}

const ENDPOINT_METRIC = /^http_req_duration\{endpoint:([^}]+)\}$/;
const endpoints = {};
for (const [name, metric] of Object.entries(metrics)) {
  const match = ENDPOINT_METRIC.exec(name);
  if (!match) continue;
  endpoints[match[1]] = {
    p95: metric.values?.["p(95)"] ?? null,
    p99: metric.values?.["p(99)"] ?? null,
  };
}

function readTrend(file) {
  if (!file || !existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
}

// Consecutive nights with breaches, ending tonight. Only the same profile counts.
const history = readTrend(values["trend-file"]).filter((r) => r.profile === values.profile);
let priorStreak = 0;
for (let i = history.length - 1; i >= 0 && history[i].breaches > 0; i--) priorStreak++;
const streak = breaches.length > 0 ? priorStreak + 1 : 0;

const row = {
  ts: new Date().toISOString(),
  sha: values.sha,
  profile: values.profile,
  breaches: breaches.length,
  consecutive_breach_nights: streak,
  failed: breaches,
  endpoints,
};

if (values["trend-file"]) {
  mkdirSync(dirname(values["trend-file"]), { recursive: true });
  appendFileSync(values["trend-file"], `${JSON.stringify(row)}\n`);
}

const fmtMs = (v) => (v == null ? "n/a" : `${Math.round(v)} ms`);
const report = [
  `## k6 budget report — ${values.profile}`,
  "",
  breaches.length === 0
    ? "✅ All performance budgets met."
    : `❌ ${breaches.length} budget(s) breached.`,
  "",
];
if (Object.keys(endpoints).length > 0) {
  report.push("| Endpoint | p95 | p99 |", "|---|---|---|");
  for (const [endpoint, v] of Object.entries(endpoints)) {
    report.push(`| \`${endpoint}\` | ${fmtMs(v.p95)} | ${fmtMs(v.p99)} |`);
  }
} else {
  report.push("_No per-endpoint latency sub-metrics in the k6 summary._");
}
if (breaches.length > 0) {
  report.push("", "**Breached thresholds**", "", ...breaches.map((b) => `- \`${b}\``));
}
report.push("", "Rationale and triage: docs/performance-budgets.md", "");
writeFileSync(values.output, report.join("\n"));

if (values["metrics-output"]) {
  // Prometheus label values must escape backslashes, quotes and newlines.
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
  const profile = `profile="${esc(values.profile)}"`;
  const out = [
    "# TYPE k6_perf_budget_breaches gauge",
    `k6_perf_budget_breaches{${profile}} ${breaches.length}`,
    "# TYPE k6_perf_budget_consecutive_breach_nights gauge",
    `k6_perf_budget_consecutive_breach_nights{${profile}} ${streak}`,
    "# TYPE k6_endpoint_latency_ms gauge",
  ];
  for (const [endpoint, v] of Object.entries(endpoints)) {
    const labels = `${profile},endpoint="${esc(endpoint)}"`;
    if (v.p95 != null) out.push(`k6_endpoint_latency_ms{${labels},percentile="p95"} ${v.p95}`);
    if (v.p99 != null) out.push(`k6_endpoint_latency_ms{${labels},percentile="p99"} ${v.p99}`);
  }
  writeFileSync(values["metrics-output"], `${out.join("\n")}\n`);
}

process.exit(breaches.length > 0 ? 1 : 0);
