#!/usr/bin/env node
// Contract coverage ratchet + PR report (Issue #240).
//
// Consumes the JSON summary emitted by
//   cargo llvm-cov report --json --summary-only
// and compares line / function / region coverage against a baseline (the
// latest main-branch run, falling back to contracts/coverage/baseline.json).
//
// Ratchet rule: coverage may not DECREASE by more than --tolerance percentage
// points (default 0.05, to absorb rounding noise). There is no absolute bar.
// A decrease is allowed only when the PR carries the waiver label
// (default `coverage-waiver`), passed in through PR_LABELS.
//
// Usage:
//   node scripts/coverage-ratchet.mjs --summary coverage-summary.json \
//     [--baseline main-summary.json] [--fallback-baseline contracts/coverage/baseline.json] \
//     [--changed-files changed.txt] [--output report.md] [--artifact-url <url>] \
//     [--tolerance 0.05] [--waiver-label coverage-waiver]
//
//   node scripts/coverage-ratchet.mjs --summary coverage-summary.json \
//     --write-baseline contracts/coverage/baseline.json

import fs from 'node:fs';

function parseArgs(argv) {
  const args = { tolerance: '0.05', waiverLabel: 'coverage-waiver' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) args[a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
  }
  if (!args.summary) {
    console.error('Missing --summary <cargo llvm-cov json summary>');
    process.exit(2);
  }
  return args;
}

const METRICS = ['lines', 'functions', 'regions'];

// Normalises either a raw llvm-cov export or our flat baseline format into
// { lines, functions, regions, files: { path: linesPercent } }.
function load(path) {
  if (!path || !fs.existsSync(path)) return null;
  const raw = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (raw.data && raw.data[0]) {
    const d = raw.data[0];
    const files = {};
    for (const f of d.files || []) {
      files[relative(f.filename)] = f.summary?.lines?.percent ?? null;
    }
    return {
      lines: d.totals.lines.percent,
      functions: d.totals.functions.percent,
      regions: d.totals.regions.percent,
      linesCovered: d.totals.lines.covered,
      linesCount: d.totals.lines.count,
      files,
    };
  }
  return raw;
}

function relative(filename) {
  const idx = filename.indexOf('/contracts/');
  return idx >= 0 ? filename.slice(idx + 1) : filename;
}

const pct = (n) => (typeof n === 'number' ? `${n.toFixed(2)}%` : 'n/a');
function diff(cur, base) {
  if (typeof cur !== 'number' || typeof base !== 'number') return '—';
  const d = cur - base;
  const sign = d > 0 ? '+' : '';
  const icon = d < 0 ? '🔻' : d > 0 ? '🔺' : '';
  return `${icon}${sign}${d.toFixed(2)} pp`;
}

const args = parseArgs(process.argv);
const current = load(args.summary);
if (!current) {
  console.error(`Coverage summary not found: ${args.summary}`);
  process.exit(2);
}

// --- Baseline refresh mode ----------------------------------------------------
if (args.writeBaseline) {
  const prev = fs.existsSync(args.writeBaseline) ? JSON.parse(fs.readFileSync(args.writeBaseline, 'utf8')) : {};
  const out = {
    $comment: prev.$comment,
    measuredAt: new Date().toISOString().slice(0, 10),
    commit: process.env.GITHUB_SHA || null,
    lines: Number(current.lines.toFixed(2)),
    functions: Number(current.functions.toFixed(2)),
    regions: Number(current.regions.toFixed(2)),
  };
  fs.writeFileSync(args.writeBaseline, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote baseline ${args.writeBaseline}: lines ${pct(out.lines)}, functions ${pct(out.functions)}, regions ${pct(out.regions)}`);
  process.exit(0);
}

// --- Ratchet mode -------------------------------------------------------------
let baseline = load(args.baseline);
let baselineSource = 'latest `main` run';
if (!baseline || typeof baseline.lines !== 'number') {
  baseline = load(args.fallbackBaseline);
  baselineSource = '`contracts/coverage/baseline.json`';
}
const hasBaseline = baseline && typeof baseline.lines === 'number';

const tolerance = Number(args.tolerance);
const labels = (process.env.PR_LABELS || '').split(',').map((s) => s.trim()).filter(Boolean);
const waived = labels.includes(args.waiverLabel);

const decreases = hasBaseline
  ? METRICS.filter((m) => typeof baseline[m] === 'number' && current[m] < baseline[m] - tolerance)
  : [];

const lines = [
  '<!-- contract-coverage-report -->',
  '## 🧪 Contract coverage',
  '',
  '| Metric | This PR | Baseline | Δ |',
  '|---|---|---|---|',
  ...METRICS.map((m) => `| ${m} | ${pct(current[m])} | ${pct(baseline?.[m])} | ${diff(current[m], baseline?.[m])} |`),
  '',
];

if (typeof current.linesCovered === 'number') {
  lines.push(`Lines covered: **${current.linesCovered} / ${current.linesCount}**. Baseline source: ${baselineSource}.`, '');
}

// Per-file view for the files this PR touched.
if (args.changedFiles && fs.existsSync(args.changedFiles)) {
  const changed = fs
    .readFileSync(args.changedFiles, 'utf8')
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.endsWith('.rs'));
  const rows = changed
    .filter((f) => f in (current.files || {}))
    .map((f) => {
      const base = baseline?.files?.[f];
      return `| \`${f}\` | ${pct(current.files[f])} | ${pct(base)} | ${diff(current.files[f], base)} |`;
    });
  if (rows.length > 0) {
    lines.push(
      '<details open><summary>Changed files</summary>',
      '',
      '| File | Lines (PR) | Lines (baseline) | Δ |',
      '|---|---|---|---|',
      ...rows,
      '',
      '</details>',
      '',
    );
  }
}

if (args.artifactUrl) {
  lines.push(`📂 [Browse the HTML coverage report](${args.artifactUrl}) (artifact \`contract-coverage-html\`).`, '');
}

let exitCode = 0;
if (!hasBaseline) {
  lines.push('ℹ️ No baseline recorded yet — reporting only. The first `main` run establishes it.');
} else if (decreases.length === 0) {
  lines.push(`✅ Ratchet passed (no decrease beyond ${tolerance} pp).`);
} else if (waived) {
  lines.push(
    `⚠️ Coverage decreased (${decreases.join(', ')}) but the \`${args.waiverLabel}\` label is present — waived. ` +
      'Explain the reason in the PR description.',
  );
} else {
  lines.push(
    `❌ **Coverage decreased** (${decreases.join(', ')}) beyond the ${tolerance} pp tolerance. ` +
      `Add tests, or apply the \`${args.waiverLabel}\` label with a justification. See \`docs/contract-coverage.md\`.`,
  );
  exitCode = 1;
}

const report = lines.join('\n') + '\n';
process.stdout.write(report);
if (args.output) fs.writeFileSync(args.output, report);
process.exit(exitCode);
