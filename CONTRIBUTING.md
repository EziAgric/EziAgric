# Contributing

Thanks for taking the time to contribute! This document covers the basics of
setting up the project, the conventions we follow, and how to get your changes
merged.

## Getting started

1. Fork the repository and clone your fork.
2. Install dependencies for the package you are working on.
3. Create a branch with a descriptive name, e.g. `fix/login-redirect`.
4. Make your changes, add tests where it makes sense, and open a pull request.

## Documentation conventions

Documentation lives in `docs/` and in the top-level `README.md`. Docs frequently
reference code — file paths, HTTP endpoints, and CLI flags — and those references
rot silently when the code moves. To keep docs honest, **anchor every code
reference in machine-checkable syntax** so CI can verify it still exists.

### Anchoring code references

Use the following inline syntax inside Markdown docs:

| Reference kind | Syntax | Example |
| --- | --- | --- |
| File path | `` `path/to/file.ext` `` | `` `backend/src/server.ts` `` |
| Endpoint | `@endpoint METHOD /path` | `@endpoint GET /api/health` |
| CLI flag | `@flag --name` | `@flag --verbose` |

Rules of thumb:

- Reference files by their repository-relative path, wrapped in backticks.
- Reference endpoints with `@endpoint <METHOD> <path>`; the path must match a
  route registered in the codebase.
- Reference CLI flags with `@flag <--flag>`; the flag must be declared in the
  relevant argument parser.
- Prefer linking to a stable anchor (a file, a route, a flag) over quoting
  snippets that will drift.

### Checking your references

The documentation checker validates every anchored reference against the
codebase. Run it locally before opening a PR:

```sh
node scripts/check-docs.mjs
```

The checker runs automatically in CI on pull requests that touch documentation
and **blocks newly broken references**. If a reference is intentionally stale
(for example, a historical ADR that describes a removed endpoint), add the doc
to the whitelist in `scripts/check-docs.mjs` with a short comment explaining why.

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
