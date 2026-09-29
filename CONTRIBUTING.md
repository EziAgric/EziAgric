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

## Pull requests

- Fill in the [PR template](.github/pull_request_template.md), including the issue's area, complexity and `Closes #<number>`.
- All relevant CI gates must pass (see README → *Required PR CI Gates*).
