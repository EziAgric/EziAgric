#!/usr/bin/env node
/**
 * Link check for the architecture diagrams (#275).
 *
 * - Every relative link (and `#anchor`) inside docs/architecture/*.md must resolve.
 * - Every link that points into docs/architecture/ from README.md or
 *   docs/adr/*.md must resolve.
 * - Every diagram page must be listed in docs/architecture/README.md and
 *   contain at least one ```mermaid block.
 *
 * External (http/https/mailto) links are not fetched, so the check is
 * deterministic and runs offline.
 *
 * Usage: node scripts/check-architecture-links.mjs
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARCH_DIR = resolve(ROOT, "docs/architecture");
const ADR_DIR = resolve(ROOT, "docs/adr");

const problems = [];

/** GitHub-style heading slug. */
function slugify(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");
}

function anchorsOf(file) {
  const anchors = new Set();
  let inFence = false;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (line.startsWith("```")) inFence = !inFence;
    if (inFence) continue;
    const match = line.match(/^#{1,6}\s+(.*)$/);
    if (match) anchors.add(slugify(match[1]));
  }
  return anchors;
}

/** Markdown links outside fenced code blocks: [text](target). */
function linksOf(file) {
  const links = [];
  let inFence = false;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (line.startsWith("```")) inFence = !inFence;
    if (inFence) continue;
    for (const match of line.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      links.push(match[1]);
    }
  }
  return links;
}

function checkLink(file, target) {
  if (/^(https?:|mailto:)/.test(target)) return;
  const [pathPart, anchor] = target.split("#");
  const resolved = pathPart ? resolve(dirname(file), decodeURI(pathPart)) : file;
  const where = relative(ROOT, file);

  if (!existsSync(resolved)) {
    problems.push(`${where}: broken link -> ${target}`);
    return;
  }
  if (anchor && statSync(resolved).isFile() && resolved.endsWith(".md")) {
    if (!anchorsOf(resolved).has(anchor)) {
      problems.push(`${where}: missing anchor -> ${target}`);
    }
  }
}

// 1. All links inside docs/architecture.
const pages = readdirSync(ARCH_DIR).filter((name) => name.endsWith(".md"));
for (const page of pages) {
  const file = resolve(ARCH_DIR, page);
  for (const link of linksOf(file)) checkLink(file, link);
}

// 2. Links into docs/architecture from README and ADRs.
const referrers = [
  resolve(ROOT, "README.md"),
  ...readdirSync(ADR_DIR)
    .filter((name) => name.endsWith(".md"))
    .map((name) => resolve(ADR_DIR, name)),
];
for (const file of referrers) {
  for (const link of linksOf(file)) {
    if (/^(https?:|mailto:)/.test(link)) continue;
    const pathPart = link.split("#")[0];
    if (!pathPart) continue;
    if (resolve(dirname(file), pathPart).startsWith(ARCH_DIR)) {
      checkLink(file, link);
    }
  }
}

// 3. Index coverage and diagram presence.
const index = readFileSync(resolve(ARCH_DIR, "README.md"), "utf8");
for (const page of pages.filter((name) => name !== "README.md")) {
  if (!index.includes(`(./${page})`)) {
    problems.push(`docs/architecture/README.md does not list ${page}`);
  }
  if (!readFileSync(resolve(ARCH_DIR, page), "utf8").includes("```mermaid")) {
    problems.push(`docs/architecture/${page} contains no mermaid diagram`);
  }
}

if (problems.length > 0) {
  console.error("architecture link check failed:\n");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`architecture link check: ${pages.length} pages OK`);
