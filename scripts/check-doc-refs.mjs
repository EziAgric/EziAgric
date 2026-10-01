#!/usr/bin/env node
/**
 * Stale documentation detection: validates that code references embedded in
 * docs actually exist. See CONTRIBUTING.md for the anchor convention.
 *
 * Convention (machine-checkable anchors in Markdown):
 *   <!-- docref: path/to/file.ext -->
 *   <!-- docref: path/to/file.ext#symbolName -->
 *   <!-- docref: GET /api/v1/things -->
 *   <!-- docref: --some-flag -->
 *
 * Historical/archived docs can be exempted via the whitelist below or by
 * adding `<!-- docref-ignore -->` to the document.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Docs that are historical/archived and intentionally not validated.
const WHITELIST = [
  'docs/adr/README.md',
  'CHANGELOG.md',
];

const DOC_EXTENSIONS = new Set(['.md', '.mdx']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next']);

const ANCHOR_RE = /<!--\s*docref:\s*([^>]+?)\s*-->/g;
const IGNORE_RE = /<!--\s*docref-ignore\s*-->/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (DOC_EXTENSIONS.has(entry.slice(entry.lastIndexOf('.')))) out.push(full);
  }
  return out;
}

function isWhitelisted(relPath) {
  return WHITELIST.some((w) => relPath === w || relPath.startsWith(w.replace(/\/$/, '') + '/'));
}

function checkFileRef(ref) {
  const [filePath, symbol] = ref.split('#');
  const abs = resolve(ROOT, filePath);
  if (!existsSync(abs)) return `referenced file not found: ${filePath}`;
  if (symbol) {
    const contents = readFileSync(abs, 'utf8');
    const symbolRe = new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    if (!symbolRe.test(contents)) return `symbol "${symbol}" not found in ${filePath}`;
  }
  return null;
}

function checkEndpointRef(ref) {
  const [, route] = ref.split(/\s+/);
  if (!route) return `malformed endpoint anchor: ${ref}`;
  const routeRe = new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\//g, '\\/'), 'i');
  const searchDirs = ['backend', 'src', 'server', 'app'].map((d) => join(ROOT, d)).filter(existsSync);
  for (const dir of searchDirs) {
    for (const file of walkSource(dir)) {
      if (routeRe.test(readFileSync(file, 'utf8'))) return null;
    }
  }
  return `endpoint not found in source: ${route}`;
}

function walkSource(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walkSource(full, out);
    else if (/\.(m?[jt]sx?|py|go|rb|java|rs)$/.test(entry)) out.push(full);
  }
  return out;
}

function checkFlagRef(ref) {
  const flag = ref.trim();
  const searchDirs = ['backend', 'src', 'server', 'app', 'scripts'].map((d) => join(ROOT, d)).filter(existsSync);
  for (const dir of searchDirs) {
    for (const file of walkSource(dir)) {
      if (readFileSync(file, 'utf8').includes(flag)) return null;
    }
  }
  return `flag not found in source: ${flag}`;
}

function checkRef(ref) {
  if (/^(GET|POST|PUT|PATCH|DELETE)\s+\//i.test(ref)) return checkEndpointRef(ref);
  if (ref.startsWith('--')) return checkFlagRef(ref);
  return checkFileRef(ref);
}

function main() {
  const docs = walk(ROOT);
  const failures = [];

  for (const doc of docs) {
    const relPath = relative(ROOT, doc);
    if (isWhitelisted(relPath)) continue;
    const contents = readFileSync(doc, 'utf8');
    if (IGNORE_RE.test(contents)) continue;

    let match;
    ANCHOR_RE.lastIndex = 0;
    while ((match = ANCHOR_RE.exec(contents)) !== null) {
      const ref = match[1].trim();
      const error = checkRef(ref);
      if (error) failures.push(`${relPath}: ${error}`);
    }
  }

  if (failures.length > 0) {
    console.error('Broken documentation references detected:\n');
    for (const failure of failures) console.error(`  - ${failure}`);
    console.error(`\n${failures.length} broken reference(s). Fix the docs or add a docref-ignore/whitelist entry.`);
    process.exit(1);
  }

  console.log('All documentation references are valid.');
}

main();
