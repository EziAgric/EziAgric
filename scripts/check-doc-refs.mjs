#!/usr/bin/env node
/**
 * Documentation reference checker.
 *
 * Validates the anchors documented in CONTRIBUTING.md ("Anchoring code references")
 * inside README.md, CONTRIBUTING.md and docs/**\/*.md:
 *
 * - `backend/src/server.ts`        file path (must include a directory and an extension) must exist
 * - `@endpoint GET /health/jobs`   a route with that method must be registered under backend/src
 * - `@flag --dry-run`              the flag must appear as a literal in scripts/, backend/scripts/ or backend/src/
 *
 * Fenced code blocks are skipped. Entries in .github/doc-refs-whitelist.json are exempt.
 *
 * Usage: node scripts/check-doc-refs.mjs
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WHITELIST = JSON.parse(readFileSync(resolve(ROOT, ".github/doc-refs-whitelist.json"), "utf8"));
const SKIP_PATHS = WHITELIST.paths ?? [];
const SKIP_REFS = WHITELIST.references ?? [];

const PATH_REF = /^[\w.-]+(?:\/[\w.@-]+)+\.\w+$/;
const ENDPOINT_REF = /^@endpoint\s+(GET|POST|PUT|PATCH|DELETE)\s+(\/\S*)$/;
const FLAG_REF = /^@flag\s+(--[a-z][\w-]*)$/;

/** Recursively list files under dir with one of the given extensions. */
function walk(dir, exts) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : walk(full, exts);
    return exts.some((ext) => entry.name.endsWith(ext)) ? [full] : [];
  });
}

const isSkipped = (doc) =>
  SKIP_PATHS.some((p) => (p.endsWith("/**") ? doc.startsWith(`${p.slice(0, -2)}/`) : doc === p));

// shortcut: route paths are matched by regex against source literals, not by mount tree;
// a documented path passes if it ends with a registered route, so prefixes are not verified.
// Upgrade when routers are mounted through a single, statically readable table.
const routes = walk(resolve(ROOT, "backend/src"), [".ts", ".js"])
  .filter((file) => !/\.test\.|__tests__/.test(file))
  .flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(/\.(get|post|put|patch|delete)\(\s*["'`](\/[^"'`]*)["'`]/g)].map(
      ([, method, path]) => ({
        method: method.toUpperCase(),
        pattern: new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:\w+/g, "[^/]+")}$`),
      }),
    ),
  );

const flagSource = ["scripts", "backend/scripts", "backend/src"]
  .flatMap((dir) => walk(resolve(ROOT, dir), [".ts", ".js", ".mjs", ".cjs", ".sh"]))
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

/** Inline code spans outside fenced code blocks. */
function codeSpansOf(file) {
  const spans = [];
  let inFence = false;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    for (const [, span] of line.matchAll(/`([^`]+)`/g)) spans.push(span);
  }
  return spans;
}

const docs = [
  resolve(ROOT, "README.md"),
  resolve(ROOT, "CONTRIBUTING.md"),
  ...walk(resolve(ROOT, "docs"), [".md"]),
]
  .map((file) => relative(ROOT, file))
  .filter((doc) => !isSkipped(doc));

const problems = [];

for (const doc of docs) {
  for (const span of codeSpansOf(resolve(ROOT, doc))) {
    let match = span.match(ENDPOINT_REF);
    if (match) {
      const [, method, path] = match;
      if (!routes.some((route) => route.method === method && route.pattern.test(path))) {
        problems.push(`${doc}: no ${method} route matches ${path}`);
      }
      continue;
    }

    match = span.match(FLAG_REF);
    if (match) {
      const [, flag] = match;
      if (!new RegExp(`(^|[^\\w-])${flag}(?![\\w-])`).test(flagSource)) {
        problems.push(`${doc}: flag ${flag} is not declared in scripts/ or backend/`);
      }
      continue;
    }

    if (PATH_REF.test(span) && !existsSync(resolve(ROOT, span))) {
      const whitelisted = SKIP_REFS.some((entry) => entry.doc === doc && entry.ref === span);
      if (!whitelisted) problems.push(`${doc}: missing file ${span}`);
    }
  }
}

if (problems.length > 0) {
  console.error("doc reference check failed:\n");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`doc reference check: ${docs.length} docs OK`);
