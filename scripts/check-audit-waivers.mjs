#!/usr/bin/env node
/**
 * Dependency vulnerability audit gate with an expiring-waiver escape hatch.
 * Tracking: issue #204 ("Gate merges on dependency vulnerability audits").
 *
 * Usage:
 *   node scripts/check-audit-waivers.mjs npm   <workspaceDir> [<workspaceName>]
 *   node scripts/check-audit-waivers.mjs cargo <workspaceDir>
 *
 * Behaviour:
 *   - Loads .github/audit-waivers.json.
 *   - Any waiver whose `expires` date is in the past fails the run immediately,
 *     regardless of whether the advisory still fires — expired waivers must be
 *     renewed or removed via review.
 *   - Runs the ecosystem audit (`pnpm audit --audit-level high --json` or
 *     `cargo audit --json`), keeps only high/critical advisories, drops the ones
 *     covered by an active waiver for this workspace, and exits non-zero if any
 *     remain.
 *
 * Exit codes: 0 = clean (or fully waived), 1 = unwaived high/critical or expired
 * waiver, 2 = usage / tooling error.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WAIVER_FILE = resolve(REPO_ROOT, ".github/audit-waivers.json");
const BLOCKING = new Set(["high", "critical"]);

function fail(msg, code = 1) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(code);
}

function todayUtc() {
  return new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
}

function loadWaivers(ecosystem) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(WAIVER_FILE, "utf8"));
  } catch (err) {
    fail(`Could not read ${WAIVER_FILE}: ${err.message}`, 2);
  }
  const list = Array.isArray(parsed[ecosystem]) ? parsed[ecosystem] : [];
  const now = todayUtc();
  const expired = [];
  const active = [];
  for (const w of list) {
    if (!w || typeof w.advisory !== "string" || typeof w.expires !== "string") {
      fail(`Malformed waiver entry (needs string \`advisory\` and \`expires\`): ${JSON.stringify(w)}`, 2);
    }
    const expires = new Date(w.expires + "T00:00:00Z");
    if (Number.isNaN(expires.getTime())) {
      fail(`Waiver ${w.advisory} has an invalid \`expires\` date: ${w.expires}`, 2);
    }
    (expires < now ? expired : active).push(w);
  }
  return { active, expired };
}

function runAudit(ecosystem, workspaceDir) {
  const cwd = resolve(REPO_ROOT, workspaceDir);
  try {
    if (ecosystem === "npm") {
      return execFileSync("pnpm", ["audit", "--audit-level", "high", "--json"], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    }
    return execFileSync("cargo", ["audit", "--json"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    // Both tools exit non-zero when advisories are found; the report is still on stdout.
    if (err.stdout) return err.stdout.toString();
    fail(`Failed to run ${ecosystem} audit in ${workspaceDir}: ${err.message}`, 2);
  }
}

function parseNpm(raw) {
  const report = JSON.parse(raw);
  const advisories = report.advisories ?? {};
  return Object.values(advisories)
    .filter((a) => BLOCKING.has(String(a.severity).toLowerCase()))
    .map((a) => ({
      id: a.github_advisory_id || `NPM-${a.id}`,
      pkg: a.module_name,
      severity: a.severity,
      title: a.title,
      url: a.url,
    }));
}

function parseCargo(raw) {
  const report = JSON.parse(raw);
  const rows = [];
  for (const v of report.vulnerabilities?.list ?? []) {
    const sev = (v.advisory?.severity || v.severity || "high").toLowerCase();
    if (!BLOCKING.has(sev) && sev !== "unknown") continue;
    rows.push({
      id: v.advisory?.id,
      pkg: v.package?.name,
      severity: sev,
      title: v.advisory?.title,
      url: v.advisory?.url,
    });
  }
  return rows;
}

function main() {
  const [ecosystem, workspaceDir, workspaceName] = process.argv.slice(2);
  if (!["npm", "cargo"].includes(ecosystem) || !workspaceDir) {
    fail("usage: check-audit-waivers.mjs <npm|cargo> <workspaceDir> [workspaceName]", 2);
  }
  const ws = workspaceName || workspaceDir.replace(/^\.?\/?/, "") || "root";

  const { active, expired } = loadWaivers(ecosystem);
  if (expired.length > 0) {
    console.error(`\n✗ ${expired.length} expired ${ecosystem} waiver(s) — renew or remove them:`);
    for (const w of expired) {
      console.error(`  - ${w.advisory} (${w.package ?? "?"}) expired ${w.expires}`);
    }
    process.exit(1);
  }

  const activeForWs = new Set(
    active.filter((w) => !w.workspace || w.workspace === ws).map((w) => w.advisory),
  );

  const raw = runAudit(ecosystem, workspaceDir);
  let findings;
  try {
    findings = ecosystem === "npm" ? parseNpm(raw) : parseCargo(raw);
  } catch (err) {
    fail(`Could not parse ${ecosystem} audit output: ${err.message}`, 2);
  }

  const unwaived = findings.filter((f) => !activeForWs.has(f.id));
  const waived = findings.filter((f) => activeForWs.has(f.id));

  if (waived.length > 0) {
    console.log(`ℹ ${waived.length} advisory(ies) waived in "${ws}": ${waived.map((f) => f.id).join(", ")}`);
  }

  if (unwaived.length === 0) {
    console.log(`✓ ${ecosystem} audit clean for "${ws}" (no unwaived high/critical advisories).`);
    process.exit(0);
  }

  console.error(`\n✗ ${unwaived.length} unwaived high/critical ${ecosystem} advisory(ies) in "${ws}":`);
  for (const f of unwaived) {
    console.error(`  - [${f.severity}] ${f.id} ${f.pkg ? `(${f.pkg})` : ""} — ${f.title ?? ""}`);
    if (f.url) console.error(`    ${f.url}`);
  }
  console.error(
    `\nFix the dependency, or add a dated waiver to .github/audit-waivers.json ` +
      `(see docs/security-scanning.md).`,
  );
  process.exit(1);
}

main();
