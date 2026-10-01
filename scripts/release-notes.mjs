#!/usr/bin/env node
// Generates categorized release notes and the next semver version from
// Conventional Commit history (issue #270).
//
// Usage:
//   node scripts/release-notes.mjs [--from <ref>] [--to <ref>] [--version <x.y.z>]
//                                  [--out <file>] [--next-version]
//
//   --from          Previous release ref. Defaults to the latest `v*` tag reachable from --to.
//   --to            Ref to release. Defaults to HEAD.
//   --version       Version to title the notes with. Defaults to the computed next version.
//   --out           Write notes to this file instead of stdout.
//   --next-version  Print only the computed next version (e.g. 1.4.0) and exit.

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const REPO_URL = "https://github.com/EziAgric/EziAgric";

const SECTIONS = [
  { key: "security", title: "🔒 Security", types: ["security"] },
  { key: "feat", title: "✨ Features", types: ["feat"] },
  { key: "fix", title: "🐛 Bug fixes", types: ["fix"] },
  { key: "perf", title: "⚡ Performance", types: ["perf"] },
  {
    key: "other",
    title: "🧰 Other changes",
    types: ["docs", "refactor", "test", "build", "ci", "chore", "style", "revert"],
  },
];

const HEADER_RE = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<bang>!)?:\s+(?<subject>.+)$/;
const BREAKING_RE = /^BREAKING[ -]CHANGE:\s*(?<note>[\s\S]+?)(?:\n\n|$)/m;
const MERGE_RE = /^Merge pull request #(?<pr>\d+) from \S+/;
const SQUASH_PR_RE = /\s*\(#(?<pr>\d+)\)$/;

function parseArgs(argv) {
  const args = { to: "HEAD" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--next-version") args.nextVersion = true;
    else if (arg.startsWith("--")) args[arg.slice(2)] = argv[++i];
  }
  return args;
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function previousTag(to) {
  try {
    return git("describe", "--tags", "--abbrev=0", "--match", "v[0-9]*", `${to}^`);
  } catch {
    return null;
  }
}

export function parseCommit({ hash, subject, body }) {
  let header = subject;
  let text = body;
  let pr = null;

  // Merge commits carry the PR title as the first body line.
  const merge = MERGE_RE.exec(subject);
  if (merge) {
    pr = merge.groups.pr;
    const [first = "", ...rest] = body.split("\n");
    header = first.trim();
    text = rest.join("\n");
  }

  const squash = SQUASH_PR_RE.exec(header);
  if (squash) {
    pr = pr ?? squash.groups.pr;
    header = header.replace(SQUASH_PR_RE, "");
  }

  const match = HEADER_RE.exec(header);
  const breakingFooter = BREAKING_RE.exec(text);
  if (!match) {
    return { hash, pr, type: null, scope: null, subject: header, breaking: false, breakingNote: null };
  }

  const { type, scope = null, bang, subject: description } = match.groups;
  return {
    hash,
    pr,
    type,
    scope,
    subject: description,
    breaking: Boolean(bang || breakingFooter),
    breakingNote: breakingFooter ? breakingFooter.groups.note.trim() : null,
  };
}

function readCommits(from, to) {
  const range = from ? `${from}..${to}` : to;
  const raw = git("log", "--first-parent", "--format=%H%x1f%s%x1f%b%x1e", range);
  return raw
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [hash, subject, body = ""] = entry.split("\x1f");
      return parseCommit({ hash, subject, body });
    });
}

export function nextVersion(current, commits) {
  const semver = /^v?(\d+)\.(\d+)\.(\d+)/.exec(current ?? "") ?? [null, 0, 0, 0];
  const [major, minor, patch] = semver.slice(1, 4).map(Number);
  if (commits.some((c) => c.breaking)) return `${major + 1}.0.0`;
  if (commits.some((c) => c.type === "feat")) return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function formatEntry(commit) {
  const scope = commit.scope ? `**${commit.scope}:** ` : "";
  const ref = commit.pr
    ? `[#${commit.pr}](${REPO_URL}/pull/${commit.pr})`
    : `[\`${commit.hash.slice(0, 7)}\`](${REPO_URL}/commit/${commit.hash})`;
  return `- ${scope}${commit.subject} (${ref})`;
}

export function renderNotes({ version, from, to, commits, date }) {
  const lines = [`# v${version} (${date})`, ""];

  const breaking = commits.filter((c) => c.breaking);
  if (breaking.length) {
    lines.push("## ⚠️ BREAKING CHANGES", "");
    lines.push("> **This release contains breaking changes. Read before upgrading.**", "");
    for (const c of breaking) {
      lines.push(formatEntry(c));
      if (c.breakingNote) lines.push(`  - ${c.breakingNote.replace(/\n/g, "\n    ")}`);
    }
    lines.push("");
  }

  const known = new Set(SECTIONS.flatMap((s) => s.types));
  for (const section of SECTIONS) {
    const entries = commits.filter((c) =>
      section.key === "other" ? !known.has(c.type) || section.types.includes(c.type) : section.types.includes(c.type),
    );
    if (!entries.length) continue;
    lines.push(`## ${section.title}`, "");
    lines.push(...entries.map(formatEntry), "");
  }

  if (!commits.length) lines.push("_No changes since the previous release._", "");

  const prev = from ?? "the previous release";
  lines.push(
    "## ↩️ Rollback",
    "",
    `If this release must be rolled back, return to \`${prev}\`:`,
    "",
    "1. **Backend / frontend / mobile** — redeploy the images or build tagged",
    `   \`${prev}\` (see \`docs/runbooks/\` and \`scripts/rollback-on-burn.sh\`).`,
    "2. **Database** — if this release ships migrations under `backend/prisma/migrations/`,",
    "   apply their `rollback.sql` in reverse order via `scripts/migrate-rollback.sh`",
    "   ([migration rollback playbook](docs/migration-rollback-playbook.md)).",
    "3. **Contracts** — if the contract WASM changed, follow the",
    "   [Safe Upgrade Guide](contracts/amana_escrow/docs/safe-upgrade-guide.md) to",
    "   upgrade back to the previous WASM hash; on-chain state is not reverted.",
    "4. Confirm health with the synthetic probes and SLO dashboards, then post in the incident channel.",
    "",
    `**Full changelog:** ${from ? `${REPO_URL}/compare/${from}...v${version}` : `${REPO_URL}/commits/${to}`}`,
    "",
  );

  return lines.join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const from = args.from ?? previousTag(args.to);
  const commits = readCommits(from, args.to);
  const version = (args.version ?? nextVersion(from, commits)).replace(/^v/, "");

  if (args.nextVersion) {
    process.stdout.write(`${version}\n`);
    return;
  }

  const notes = renderNotes({
    version,
    from,
    to: args.to,
    commits,
    date: new Date().toISOString().slice(0, 10),
  });

  if (args.out) writeFileSync(args.out, notes);
  else process.stdout.write(notes);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
