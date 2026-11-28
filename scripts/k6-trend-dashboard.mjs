#!/usr/bin/env node
/**
 * Renders the nightly k6 trend JSONL (appended by k6-budget-report.mjs) as a
 * Markdown table for the perf-trends branch and the job summary (issue #695).
 *
 * Usage: node scripts/k6-trend-dashboard.mjs <trend.jsonl> <out.md> [--last 30]
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { last: { type: "string", default: "30" } },
});

const [trendFile, outFile] = positionals;
if (!trendFile || !outFile) {
  console.error("usage: k6-trend-dashboard.mjs <trend.jsonl> <out.md> [--last 30]");
  process.exit(1);
}

const rows = existsSync(trendFile)
  ? readFileSync(trendFile, "utf8")
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      })
  : [];

const recent = rows.slice(-Number(values.last));
const endpoints = [...new Set(recent.flatMap((r) => Object.keys(r.endpoints ?? {})))].sort();
const fmt = (v) => (v == null ? "–" : Math.round(v));

const lines = [
  "# k6 nightly performance trend",
  "",
  `Last ${recent.length} run(s). Generated ${new Date().toISOString()}.`,
  "",
];

if (recent.length === 0) {
  lines.push("No runs recorded yet.");
} else {
  const header = ["Date (UTC)", "SHA", "Breaches", "Breach streak", ...endpoints.map((e) => `${e} p95 / p99`)];
  lines.push(`| ${header.join(" | ")} |`, `|${header.map(() => "---").join("|")}|`);
  for (const r of recent) {
    const cells = [
      r.ts?.slice(0, 10) ?? "–",
      (r.sha ?? "").slice(0, 7) || "–",
      String(r.breaches ?? 0),
      String(r.consecutive_breach_nights ?? 0),
      ...endpoints.map((e) => {
        const v = r.endpoints?.[e];
        return v ? `${fmt(v.p95)} / ${fmt(v.p99)} ms` : "–";
      }),
    ];
    lines.push(`| ${cells.join(" | ")} |`);
  }
}

lines.push("");
writeFileSync(outFile, lines.join("\n"));
