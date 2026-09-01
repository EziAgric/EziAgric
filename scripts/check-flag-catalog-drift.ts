#!/usr/bin/env ts-node
/**
 * check-flag-catalog-drift.ts
 *
 * CI guard: verifies that the frontend FLAG_CATALOG and the backend
 * feature-flags service agree on flag names.
 *
 * Rules enforced:
 *  1. Every flag the backend persists (keys in Redis `feature:*` namespace)
 *     must appear in the frontend FLAG_CATALOG.
 *  2. A frontend flag NOT present in the backend service is allowed (it may
 *     be env-var-only), but a warning is emitted.
 *  3. Any flag in the backend that is missing from the frontend catalog
 *     fails the check (exit 1).
 *
 * In CI the backend is not running, so we compare statically:
 *  - Frontend catalog: imported from frontend/src/lib/featureFlags.ts
 *  - Backend definitions: parsed from backend/src/services/feature-flags.service.ts
 *    (no flag name constants exist there — the names live in Redis keys set
 *     at runtime, so we compare against a reference list maintained here)
 *
 * To add a new flag:
 *  1. Add it to `BACKEND_KNOWN_FLAGS` in this file.
 *  2. Add it to `FLAG_CATALOG` in frontend/src/lib/featureFlags.ts.
 *  3. Optionally add it to the backend's seed/init script.
 *
 * Usage:
 *   npx ts-node --project tsconfig.json scripts/check-flag-catalog-drift.ts
 *
 * Exit codes:
 *   0 — catalogs are in sync (or backend has subset of frontend flags)
 *   1 — backend flag missing from frontend catalog (drift detected)
 */

import * as path from 'path';
import * as fs from 'fs';

// ---------------------------------------------------------------------------
// Reference list of all flag names the backend feature-flags service manages.
// Keep this in sync with any seeding or PATCH calls in backend code.
// ---------------------------------------------------------------------------
const BACKEND_KNOWN_FLAGS: string[] = [
  'adminUI',
  'clawbackUI',
  'advancedReporting',
  'offlineBanner',
  'tradeWizardV2',
];

// ---------------------------------------------------------------------------
// Load frontend FLAG_CATALOG
// ---------------------------------------------------------------------------

const frontendFlagsPath = path.resolve(
  __dirname,
  '../frontend/src/lib/featureFlags.ts',
);

if (!fs.existsSync(frontendFlagsPath)) {
  console.error(`[drift-check] Cannot find ${frontendFlagsPath}`);
  process.exit(1);
}

const frontendSource = fs.readFileSync(frontendFlagsPath, 'utf8');

// Extract keys from FLAG_CATALOG by parsing the object literal in the source.
const catalogMatch = frontendSource.match(
  /export\s+const\s+FLAG_CATALOG\s*=\s*\{([^}]+)\}/s,
);
if (!catalogMatch) {
  console.error('[drift-check] Could not parse FLAG_CATALOG from featureFlags.ts');
  process.exit(1);
}

const catalogBody = catalogMatch[1];
const frontendFlagKeys = new Set<string>();
for (const match of catalogBody.matchAll(/^\s+(\w+)\s*:/gm)) {
  frontendFlagKeys.add(match[1]);
}

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------

let exitCode = 0;
const backendSet = new Set(BACKEND_KNOWN_FLAGS);

console.log('\n=== Feature Flag Catalog Drift Check ===\n');
console.log(`Frontend FLAG_CATALOG keys (${frontendFlagKeys.size}):`, [...frontendFlagKeys].join(', '));
console.log(`Backend known flags     (${backendSet.size}):`, [...backendSet].join(', '));
console.log();

// Check: every backend flag must exist in the frontend catalog.
for (const backendFlag of BACKEND_KNOWN_FLAGS) {
  if (!frontendFlagKeys.has(backendFlag)) {
    console.error(
      `[drift-check] FAIL: backend flag '${backendFlag}' is MISSING from frontend FLAG_CATALOG`,
    );
    exitCode = 1;
  }
}

// Warn: frontend-only flags (not in backend).
for (const frontendFlag of frontendFlagKeys) {
  if (!backendSet.has(frontendFlag)) {
    console.warn(
      `[drift-check] WARN: frontend flag '${frontendFlag}' has no backend counterpart — ensure it is env-var-only by design`,
    );
  }
}

if (exitCode === 0) {
  console.log('[drift-check] OK — flag catalogs are consistent.\n');
} else {
  console.error(
    '\n[drift-check] FAIL — add missing backend flags to frontend FLAG_CATALOG in',
    'frontend/src/lib/featureFlags.ts\n',
  );
}

process.exit(exitCode);
