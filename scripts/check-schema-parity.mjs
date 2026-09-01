#!/usr/bin/env node
/**
 * CI guard: the canonical domain-schema files consumed by the backend and the
 * frontend must stay identical until they are promoted to a shared workspace
 * package (see docs/shared-schemas.md). Compares everything from the first
 * `import { z }` line onward (the leading doc comment may reference the mirror
 * path and is allowed to differ).
 *
 * Usage: node scripts/check-schema-parity.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PAIRS = [
  {
    name: "trade domain schema",
    a: "backend/src/schemas/domain/trade.ts",
    b: "frontend/src/lib/domain-schemas/trade.ts",
  },
];

function body(path) {
  const text = readFileSync(resolve(root, path), "utf8");
  const idx = text.indexOf('import { z } from "zod";');
  if (idx === -1) throw new Error(`${path}: missing 'import { z } from "zod";' anchor`);
  return text.slice(idx).replace(/\s+$/, "");
}

let failed = false;
for (const pair of PAIRS) {
  if (body(pair.a) === body(pair.b)) {
    console.log(`✓ ${pair.name}: ${pair.a} ≡ ${pair.b}`);
  } else {
    failed = true;
    console.error(
      `✗ ${pair.name}: ${pair.a} and ${pair.b} have diverged.\n` +
        `  Update both files identically, or promote them to packages/domain-schemas.`,
    );
  }
}

process.exit(failed ? 1 : 0);
