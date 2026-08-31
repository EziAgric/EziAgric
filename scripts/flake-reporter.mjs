#!/usr/bin/env node
/**
 * flake-reporter.mjs
 *
 * Detects flaky test candidates from Jest JSON results and writes a
 * structured flake report.
 *
 * A test is a flake CANDIDATE when:
 *   - Its test result file shows a failed + passed run for the same test name
 *     within the same CI session (pass-after-retry pattern), OR
 *   - It is already present in the quarantine registry (tracked flake).
 *
 * Usage (CI):
 *   node scripts/flake-reporter.mjs \
 *     --results   backend/jest-results.json \
 *     --results   frontend/jest-results.json \
 *     --registry  .github/flaky-tests-quarantine.json \
 *     --output    reports/flake/flake-report.json \
 *     --scope     backend \
 *     --scope     frontend
 *
 * Usage (weekly report aggregation):
 *   node scripts/flake-reporter.mjs \
 *     --report-dir reports/flake/ \
 *     --weekly-output reports/flake/weekly-summary.md
 *
 * Exit codes:
 *   0 — completed successfully (flakes may exist but are non-blocking)
 *   1 — script error (missing input, parse failure)
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ─── Argument parsing ────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    results: [],
    scopes: [],
    registry: join(ROOT, ".github/flaky-tests-quarantine.json"),
    output: null,
    reportDir: null,
    weeklyOutput: null,
  };

  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case "--results":
        args.results.push(resolve(ROOT, argv[++i]));
        break;
      case "--registry":
        args.registry = resolve(ROOT, argv[++i]);
        break;
      case "--output":
        args.output = resolve(ROOT, argv[++i]);
        break;
      case "--scope":
        args.scopes.push(argv[++i]);
        break;
      case "--report-dir":
        args.reportDir = resolve(ROOT, argv[++i]);
        break;
      case "--weekly-output":
        args.weeklyOutput = resolve(ROOT, argv[++i]);
        break;
    }
  }
  return args;
}

const args = parseArgs(process.argv);

// ─── Load quarantine registry ────────────────────────────────────────────────

function loadRegistry(path) {
  if (!existsSync(path)) return { entries: [] };
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    console.warn(`[flake-reporter] WARNING: cannot parse registry at ${path}`);
    return { entries: [] };
  }
}

// ─── Parse Jest JSON results ─────────────────────────────────────────────────

/**
 * Jest JSON result shape (jest --json):
 * {
 *   testResults: [{
 *     testFilePath: string,
 *     status: "passed"|"failed",
 *     testResults: [{
 *       fullName: string,
 *       status: "passed"|"failed"|"pending",
 *       duration: number,
 *       failureMessages: string[]
 *     }]
 *   }]
 * }
 */
function parseJestResults(filePath) {
  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8"));
    return raw;
  } catch (err) {
    console.warn(`[flake-reporter] WARNING: cannot parse ${filePath}: ${err.message}`);
    return null;
  }
}

/**
 * Extract flake candidates from a Jest JSON result.
 * A "pass-after-retry" pattern is inferred when a suite-level status is
 * "passed" but contains individual test results with failureMessages
 * (Jest retryTimes leaves the suite passing but records the initial failures).
 */
function extractFlakeCandidates(jestResult, scope) {
  if (!jestResult?.testResults) return [];

  const candidates = [];

  for (const suite of jestResult.testResults) {
    const filePath = suite.testFilePath ?? suite.testFilePath ?? "";

    for (const test of suite.testResults ?? []) {
      const hasRetryFailure =
        test.status === "passed" &&
        Array.isArray(test.failureMessages) &&
        test.failureMessages.length > 0;

      const wasActuallyFailed =
        test.status === "failed";

      if (hasRetryFailure || wasActuallyFailed) {
        candidates.push({
          fullName: test.fullName,
          filePath: filePath.replace(ROOT, "").replace(/^\//, ""),
          status: test.status,
          failureMessages: test.failureMessages ?? [],
          duration: test.duration ?? 0,
          scope: scope ?? "other",
          detectedAt: new Date().toISOString(),
          isPassAfterRetry: hasRetryFailure,
        });
      }
    }
  }

  return candidates;
}

// ─── Weekly summary generator ────────────────────────────────────────────────

function generateWeeklySummary(reportDir, registry, outputPath) {
  if (!existsSync(reportDir)) {
    console.warn(`[flake-reporter] Report dir ${reportDir} does not exist — nothing to summarise.`);
    return;
  }

  const files = readdirSync(reportDir).filter(
    (f) => f.endsWith(".json") && f !== "weekly-summary.json",
  );

  const allCandidates = [];
  for (const file of files) {
    try {
      const report = JSON.parse(readFileSync(join(reportDir, file), "utf8"));
      if (Array.isArray(report.candidates)) {
        allCandidates.push(...report.candidates);
      }
    } catch {
      // skip unparseable reports
    }
  }

  // Deduplicate and count by fullName
  const freq = new Map();
  for (const c of allCandidates) {
    const key = `${c.scope}::${c.fullName}`;
    if (!freq.has(key)) {
      freq.set(key, { ...c, count: 0 });
    }
    freq.get(key).count++;
  }

  // Sort by frequency descending
  const ranked = [...freq.values()].sort((a, b) => b.count - a.count);

  // Load quarantine entries for cross-reference
  const quarantined = new Set(
    (registry.entries ?? []).map((e) => e.pattern),
  );

  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    `# Flaky Test Weekly Report — ${today}`,
    "",
    `Generated from **${files.length}** CI run report(s) in \`${reportDir}\`.`,
    "",
    "## Summary",
    "",
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Total flake candidates detected | ${ranked.length} |`,
    `| Already quarantined | ${[...freq.values()].filter((c) => quarantined.has(c.filePath)).length} |`,
    `| New (not yet quarantined) | ${ranked.filter((c) => !quarantined.has(c.filePath)).length} |`,
    "",
    "## Ranked by frequency",
    "",
    "| Rank | Test | File | Scope | Occurrences | Quarantined? |",
    "|------|------|------|-------|-------------|-------------|",
  ];

  ranked.forEach((c, i) => {
    const isQ = quarantined.has(c.filePath) ? "✓" : "—";
    const shortName = c.fullName.length > 60
      ? c.fullName.slice(0, 57) + "…"
      : c.fullName;
    lines.push(
      `| ${i + 1} | ${shortName} | \`${c.filePath}\` | ${c.scope} | ${c.count} | ${isQ} |`,
    );
  });

  lines.push(
    "",
    "## Quarantine registry",
    "",
    `Active entries in \`.github/flaky-tests-quarantine.json\`: **${registry.entries?.length ?? 0}**`,
    "",
  );

  const today_ = new Date();
  today_.setHours(0, 0, 0, 0);
  const expired = (registry.entries ?? []).filter((e) => {
    const d = new Date(e.expires_on + "T00:00:00.000Z");
    return d < today_;
  });

  if (expired.length > 0) {
    lines.push(
      `> ⚠ **${expired.length} expired entr${expired.length === 1 ? "y" : "ies"}** — these must be fixed or extended:`,
      "",
    );
    expired.forEach((e) => {
      lines.push(`- \`${e.pattern}\` (expired ${e.expires_on}, owner: @${e.owner})`);
    });
    lines.push("");
  }

  lines.push(
    "## Next steps",
    "",
    "1. For new candidates not yet quarantined: open an issue and add an entry to `.github/flaky-tests-quarantine.json`.",
    "2. For quarantined tests: check if they can be fixed before their expiry.",
    "3. Expired entries will cause `validate-flaky-quarantine.mjs` to fail CI — fix them promptly.",
    "",
    "---",
    "",
    `_Report generated by \`scripts/flake-reporter.mjs\` at ${new Date().toISOString()}_`,
  );

  const markdown = lines.join("\n");

  // Ensure output dir exists
  const outDir = dirname(outputPath);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  writeFileSync(outputPath, markdown, "utf8");
  console.log(`[flake-reporter] Weekly summary written to ${outputPath}`);

  // Also write JSON for downstream consumption
  const jsonOut = outputPath.replace(/\.md$/, ".json");
  writeFileSync(
    jsonOut,
    JSON.stringify({ generatedAt: new Date().toISOString(), ranked, quarantineCount: registry.entries?.length ?? 0 }, null, 2),
    "utf8",
  );
  console.log(`[flake-reporter] Weekly JSON written to ${jsonOut}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

const registry = loadRegistry(args.registry);

// Weekly aggregation mode
if (args.weeklyOutput && args.reportDir) {
  generateWeeklySummary(args.reportDir, registry, args.weeklyOutput);
  process.exit(0);
}

// Per-run reporting mode
if (args.results.length === 0) {
  console.log("[flake-reporter] No --results files provided. Nothing to analyse.");
  process.exit(0);
}

const allCandidates = [];

for (let i = 0; i < args.results.length; i++) {
  const resultFile = args.results[i];
  const scope = args.scopes[i] ?? "other";

  if (!existsSync(resultFile)) {
    console.warn(`[flake-reporter] WARNING: results file not found: ${resultFile}`);
    continue;
  }

  const jestResult = parseJestResults(resultFile);
  if (!jestResult) continue;

  const candidates = extractFlakeCandidates(jestResult, scope);
  allCandidates.push(...candidates);
  console.log(
    `[flake-reporter] ${scope}: ${candidates.length} flake candidate(s) from ${resultFile}`,
  );
}

// Cross-reference with quarantine registry
const quarantinedPatterns = new Set(
  (registry.entries ?? []).map((e) => e.pattern),
);

const report = {
  generatedAt: new Date().toISOString(),
  runId: process.env.GITHUB_RUN_ID ?? "local",
  sha: process.env.GITHUB_SHA ?? "local",
  ref: process.env.GITHUB_REF ?? "local",
  totalCandidates: allCandidates.length,
  newCandidates: allCandidates.filter(
    (c) => !quarantinedPatterns.has(c.filePath),
  ).length,
  candidates: allCandidates,
};

// Write report
if (args.output) {
  const outDir = dirname(args.output);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(args.output, JSON.stringify(report, null, 2), "utf8");
  console.log(`[flake-reporter] Report written to ${args.output}`);
}

// Print summary to stdout for GitHub Actions step summary
if (allCandidates.length > 0) {
  console.log(`\n[flake-reporter] ⚠ ${allCandidates.length} flake candidate(s) detected:`);
  allCandidates.forEach((c) => {
    const tag = quarantinedPatterns.has(c.filePath) ? "[quarantined]" : "[NEW]";
    console.log(`  ${tag} ${c.scope} :: ${c.fullName}`);
    console.log(`         ${c.filePath}`);
  });
  console.log(
    "\nNew candidates should be added to .github/flaky-tests-quarantine.json.",
  );
} else {
  console.log("[flake-reporter] No flake candidates detected.");
}

process.exit(0);
