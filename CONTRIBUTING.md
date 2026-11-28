# Contributing

Thanks for taking the time to contribute! This document covers the basics of
setting up the project, the conventions we follow, and how to get your changes
merged.

## Getting started

1. Fork the repository and clone your fork.
2. Install dependencies for the package you are working on.
3. Create a branch with a descriptive name, e.g. `fix/login-redirect`.
4. Make your changes, add tests where it makes sense, and open a pull request.

## Commit message format

All commits in a pull request are validated against the
[Conventional Commits](https://www.conventionalcommits.org/) spec by commitlint
(`commitlint.config.js`, extending `@commitlint/config-conventional`). CI checks
every commit on your branch that is not in `main` and fails with a list of the
non-compliant commits.

```
<type>(<optional scope>)!: <description>
```

- **type** — one of `feat`, `fix`, `perf`, `security`, `docs`, `refactor`,
  `test`, `build`, `ci`, `chore`, `style`, `revert`.
- **scope** — optional, e.g. `feat(api): ...`.
- **description** — short, imperative, lower-case summary.
- Mark breaking changes with `!` after the type/scope (`feat(api)!: ...`) or a
  `BREAKING CHANGE:` footer in the commit body.

Examples:

```
feat(contracts): add self-trade guard
fix(api): reject zero-amount transfers
docs: clarify deployment steps
```

To check your commits locally before pushing:

```sh
npx commitlint --from origin/main --to HEAD --verbose
```

## Documentation conventions

Documentation lives in `docs/` and in the top-level `README.md`. Docs frequently
reference code — file paths, HTTP endpoints, and CLI flags — and those references
rot silently when the code moves. To keep docs honest, **anchor every code
reference in machine-checkable syntax** so CI can verify it still exists.

### Anchoring code references

Use the following inline syntax inside Markdown docs:

| Reference kind | Syntax | Example |
| --- | --- | --- |
| File path | `` `path/to/file.ext` `` | `` `backend/src/routes/job-health.routes.ts` `` |
| Endpoint | `` `@endpoint <METHOD> <path>` `` | `` `@endpoint GET /health/jobs` `` |
| CLI flag | `` `@flag <--flag>` `` | `` `@flag --dry-run` `` |

Rules of thumb:

- Reference files by their repository-relative path, wrapped in backticks. The
  path must include a directory and a file extension.
- Reference endpoints with `@endpoint <METHOD> <path>`; a route registered with
  that method under `backend/src/` must match the path. Mount prefixes may be
  omitted from the registration, so `GET /health/jobs` matches `router.get("/jobs")`.
- Reference CLI flags with `` `@flag --name` ``; the flag must appear as a literal
  in `scripts/`, `backend/scripts/` or `backend/src/`.
- Prefer linking to a stable anchor (a file, a route, a flag) over quoting
  snippets that will drift.
- Text inside fenced code blocks is not checked.

### Checking your references

The documentation checker validates every anchored reference against the
codebase. Run it locally before opening a PR:

```sh
node scripts/check-doc-refs.mjs
```

The checker runs automatically in CI on pull requests that touch documentation
and **blocks newly broken references**. If a reference is intentionally stale
(for example, a historical ADR that describes a removed file), add an entry to
`references` in `.github/doc-refs-whitelist.json` with a reason explaining why.

### Ownership and staleness

Each doc may declare an owner and a review date in front matter:

```yaml
---
owner: @team-platform
last_reviewed: 2024-01-15
---
```

Docs whose `last_reviewed` date is older than 180 days are reported as stale so
their owners can re-review them. A weekly report lists broken references and
stale docs; keep it clean or triage the entries.

## Pull requests

- Keep changes focused; one logical change per pull request.
- Describe what changed and why in the PR description.
- Make sure CI is green before requesting review.

## Questions

If anything here is unclear, open an issue and we will improve this guide.

## Snapshot Testing (Mobile)

The mobile app uses Jest snapshot tests to detect UI regressions. When adding or modifying components in `mobile/src/screens/`, update snapshots after changes:

```sh
cd mobile && npm test -- --updateSnapshot
```

Review all snapshot changes in PRs to ensure they reflect intended UI changes. Commit updated snapshots alongside code changes.
# Contributing to EziAgric

## Picking up an issue (Drips Wave)

1. Open issues using one of the [issue forms](.github/ISSUE_TEMPLATE/) — **Bug report**, **Feature request** or **Documentation**. Every form asks for:
   - **Area** — Backend, Frontend, Mobile, Contracts, DevOps or Docs
   - **Complexity** — the Drips Wave level:
     | Level | Points | Scope |
     |---|---|---|
     | Trivial | 100 | Typos, minor copy changes, or very small, well-contained fixes |
     | Medium | 150 | Standard features or fixes touching a few files |
     | High | 200 | Complex features, cross-cutting changes or deep investigation |
   - **Acceptance criteria** — the checklist that must be true before the issue is closed
2. Comment on the issue to apply through Drips Wave before starting work. One contributor per issue.
3. If the work turns out bigger than the stated complexity, say so on the issue so a maintainer can adjust it.

## Commits and PR titles

PR titles (and commits) follow [Conventional Commits](https://www.conventionalcommits.org/). The PR title is linted in CI (`.github/workflows/pr-title.yml`) and drives the automated release notes and version bump (`.github/workflows/release.yml`).

```
<type>(<optional scope>)!: <description>
```

| Type | Release notes section | Version bump |
|---|---|---|
| `feat` | Features | minor |
| `fix`, `perf` | Bug fixes / Performance | patch |
| `security` | Security | patch |
| `docs`, `refactor`, `test`, `build`, `ci`, `chore`, `style`, `revert` | Other changes | patch |

Mark breaking changes with `!` after the type/scope (`feat(api)!: ...`) or a `BREAKING CHANGE:` footer in the commit body. Breaking changes produce a major bump and are highlighted at the top of the release notes.

### Commit message requirements

Every commit on a PR branch that is not already in `main` is validated by
commitlint (`commitlint.config.js`, extending `@commitlint/config-conventional`)
in CI. Non-compliant commits fail the check with a list of the offending SHAs and
messages. To validate locally before pushing:

```sh
npx commitlint --from origin/main --to HEAD --verbose
```

## Pull requests

- Fill in the [PR template](.github/pull_request_template.md), including the issue's area, complexity and `Closes #<number>`.
- All relevant CI gates must pass (see README → *Required PR CI Gates*).
- Arch-affecting changes (new or removed components, changes to who may call an
  entry point, or to the message order that settles a trade or dispute) update the
  relevant diagram under `docs/architecture` in the same PR, and say in the PR
  description why no diagram changed when that is not obvious — see
  [docs/architecture/README.md](docs/architecture/README.md).

## Load testing

Write-path load tests live under `k6/` and use [k6](https://k6.io). Each scenario targets one endpoint group:

| File | Coverage |
|---|---|
| `k6/deposit.js` | `POST /api/v1/trades/:id/deposit` |
| `k6/confirm.js` | `POST /api/v1/trades/:id/confirm` |
| `k6/dispute.js` | `POST /api/v1/trades/:id/dispute` |

**Environment variables:**

| Variable | Description |
|---|---|
| `K6_API_URL` | Base URL of the target API, e.g. `https://staging.eziagric.app` |
| `K6_AUTH_TOKEN` | Bearer token for an authenticated test user |
| `K6_VUS` | Number of virtual users (default: 10) |
| `K6_DURATION` | Test duration, e.g. `30s` (default: `30s`) |

Run locally:
```sh
K6_API_URL=http://localhost:4000 K6_AUTH_TOKEN=<token> k6 run k6/deposit.js
```

Add a new scenario file when introducing a new write endpoint expected to receive high traffic.
See #690 for the initial k6 coverage milestone.

## Where do implementation and PR notes go?

Do **not** add implementation notes, PR summaries, or wave/issue write-ups to the repository root. The root should only contain project-level files (e.g. `README.md`, `CONTRIBUTING.md`, `LICENSE`, config files).

- **Implementation notes** (e.g. `ISSUE_<n>_IMPLEMENTATION.md`) → `docs/` topic pages.
- **PR summaries** (e.g. `PR_SUMMARY_ISSUE_<n>.md`) → the PR description, or a `docs/` topic page when the content is durable reference material.
- **Wave / program write-ups** → `docs/` topic pages.

If a note is no longer useful, delete it rather than leaving it in the root. Historical notes that must be retained belong under `docs/archive/`.
