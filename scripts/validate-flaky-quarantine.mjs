#!/usr/bin/env node
/**
 * validate-flaky-quarantine.mjs
 *
 * Validates .github/flaky-tests-quarantine.json:
 *   1. All entries have required fields (owner, expires_on, scope, pattern, reason, mitigation).
 *   2. No entry has expires_on in the past (expired entries block CI).
 *   3. expires_on is a valid ISO date (YYYY-MM-DD).
 *   4. scope is one of the allowed values.
 *
 * Exit codes:
 *   0 — registry is valid
 *   1 — validation errors found (prints details)
 *
 * Usage:
 *   node scripts/validate-flaky-quarantine.mjs
 *   node scripts/validate-flaky-quarantine.mjs --allow-expired  (CI dry-run)
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = resolve(__dirname, "../.github/flaky-tests-quarantine.json");
const ALLOWED_SCOPES = ["frontend", "backend", "contracts", "e2e", "other"];
const REQUIRED_FIELDS = ["owner", "expires_on", "scope", "pattern", "reason", "mitigation"];

// ─── Parse flags ────────────────────────────────────────────────────────────

const allowExpired = process.argv.includes("--allow-expired");

// ─── Load registry ──────────────────────────────────────────────────────────

let registry;
try {
  registry = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
} catch (err) {
  console.error(`[flaky-quarantine] ERROR: Cannot read registry at ${REGISTRY_PATH}`);
  console.error(`  ${err.message}`);
  process.exit(1);
}

if (!Array.isArray(registry.entries)) {
  console.error("[flaky-quarantine] ERROR: registry.entries must be an array");
  process.exit(1);
}

// ─── Validate ────────────────────────────────────────────────────────────────

const today = new Date();
today.setHours(0, 0, 0, 0);

const errors = [];
const warnings = [];

for (let i = 0; i < registry.entries.length; i++) {
  const entry = registry.entries[i];
  const label = `entries[${i}] (pattern: ${entry.pattern ?? "unknown"})`;

  // Required fields
  for (const field of REQUIRED_FIELDS) {
    if (!entry[field]) {
      errors.push(`${label}: missing required field "${field}"`);
    }
  }

  // expires_on format
  if (entry.expires_on) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.expires_on)) {
      errors.push(`${label}: expires_on "${entry.expires_on}" is not YYYY-MM-DD format`);
    } else {
      const expiry = new Date(entry.expires_on + "T00:00:00.000Z");
      if (isNaN(expiry.getTime())) {
        errors.push(`${label}: expires_on "${entry.expires_on}" is not a valid date`);
      } else if (expiry < today) {
        const message = `${label}: expires_on "${entry.expires_on}" is in the past (expired ${Math.ceil((today - expiry) / 86400000)} days ago)`;
        if (allowExpired) {
          warnings.push(message);
        } else {
          errors.push(message + " — fix or extend before merging");
        }
      }
    }
  }

  // scope
  if (entry.scope && !ALLOWED_SCOPES.includes(entry.scope)) {
    errors.push(
      `${label}: scope "${entry.scope}" is not one of [${ALLOWED_SCOPES.join(", ")}]`,
    );
  }
}

// ─── Report ──────────────────────────────────────────────────────────────────

if (warnings.length > 0) {
  console.warn("[flaky-quarantine] WARNINGS:");
  warnings.forEach((w) => console.warn(`  ⚠  ${w}`));
}

if (errors.length > 0) {
  console.error(`[flaky-quarantine] FAILED — ${errors.length} error(s) found:`);
  errors.forEach((e) => console.error(`  ✗  ${e}`));
  console.error("");
  console.error(
    "Fix expired entries (extend expires_on or remove the entry) and re-run.",
  );
  process.exit(1);
}

const count = registry.entries.length;
console.log(
  `[flaky-quarantine] OK — ${count} quarantine entr${count === 1 ? "y" : "ies"} validated, none expired.`,
);
process.exit(0);
