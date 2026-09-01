#!/usr/bin/env node
/**
 * Fails if any `.trivyignore` entry is past its `# expires: YYYY-MM-DD` marker,
 * or if an ignore id has no preceding expiry marker at all (issue #206).
 *
 * Exit codes: 0 = all entries active and well-formed, 1 = expired/missing marker,
 * 2 = file unreadable.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = resolve(REPO_ROOT, ".trivyignore");

let lines;
try {
  lines = readFileSync(FILE, "utf8").split(/\r?\n/);
} catch (err) {
  console.error(`✗ Could not read ${FILE}: ${err.message}`);
  process.exit(2);
}

const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
const problems = [];
let pendingExpiry = null; // { date: Date, raw: string, line: number }

lines.forEach((line, i) => {
  const lineNo = i + 1;
  const trimmed = line.trim();
  if (trimmed === "") return;

  const m = trimmed.match(/^#\s*expires:\s*(\d{4}-\d{2}-\d{2})\s*$/i);
  if (m) {
    const date = new Date(m[1] + "T00:00:00Z");
    if (Number.isNaN(date.getTime())) {
      problems.push(`line ${lineNo}: invalid expires date "${m[1]}"`);
      pendingExpiry = null;
    } else {
      pendingExpiry = { date, raw: m[1], line: lineNo };
    }
    return;
  }

  if (trimmed.startsWith("#")) return; // other comment — keep any pending expiry

  // A concrete ignore id (CVE / misconfig rule).
  if (!pendingExpiry) {
    problems.push(`line ${lineNo}: "${trimmed}" has no preceding "# expires: YYYY-MM-DD" marker`);
    return;
  }
  if (pendingExpiry.date < today) {
    problems.push(
      `line ${lineNo}: "${trimmed}" is covered by an EXPIRED waiver (expired ${pendingExpiry.raw}) — renew or remove`,
    );
  }
  pendingExpiry = null;
});

if (problems.length > 0) {
  console.error("✗ .trivyignore validation failed:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log("✓ .trivyignore: all exceptions have an unexpired expiry marker.");
