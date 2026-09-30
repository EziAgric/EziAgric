# Contributing to EziAgric

Thank you for contributing to EziAgric. This guide explains how to pick up work via the Drips Wave programme, what conventions to follow, and what CI gates to satisfy before opening a PR.

---

## Table of Contents

1. [Claiming an Issue via Drips Wave](#claiming-an-issue-via-drips-wave)
2. [Complexity Levels](#complexity-levels)
3. [Branch and Commit Conventions](#branch-and-commit-conventions)
4. [PR Checklist](#pr-checklist)
5. [CI Gates](#ci-gates)

---

## Claiming an Issue via Drips Wave

EziAgric compensates contributors through [Drips](https://www.drips.network/). Issues eligible for Drips rewards carry the `drips-wave` label.

1. Browse open issues labelled `drips-wave` on the [issue tracker](https://github.com/EziAgric/EziAgric/issues).
2. Leave a comment saying you want to work on it. A maintainer will assign you within 48 hours.
3. Fork the repo, create a branch (see [Branch and Commit Conventions](#branch-and-commit-conventions)), and start working.
4. Reference the issue in every commit and in the PR description using `Closes #N` so GitHub links the reward automatically.
5. Keep your fork in sync with `upstream/main` before opening your PR:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

---

## Complexity Levels

Issues are tagged with one of three complexity labels to help you gauge expected effort:

| Label | Description | Typical scope |
|---|---|---|
| `complexity: low` | Small, well-defined change | A single file, no new dependencies |
| `complexity: medium` | Moderate change spanning a few files | May touch tests, types, or navigation |
| `complexity: high` | Significant feature or refactor | Multiple packages, new services or screens |

Pick a level you are comfortable with. Low-complexity issues are a good first contribution.

---

## Branch and Commit Conventions

### Branch names

Use a short prefix that matches the change type, followed by a kebab-case description:

```
feat/<description>          # new feature
fix/<description>           # bug fix
docs/<description>          # documentation only
chore/<description>         # maintenance, deps, config
test/<description>          # test-only changes
```

Examples:
```
feat/onboarding-carousel
fix/coop-role-gating
docs/contributing-guide
```

### Commit messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <short summary>

[optional body]

Closes #N
```

- **type**: `feat`, `fix`, `docs`, `chore`, `test`, `refactor`, `perf`
- **scope**: optional, e.g. `mobile`, `backend`, `contracts`, `frontend`
- **summary**: imperative mood, lowercase, no trailing period, max 72 chars
- Always include `Closes #N` for issues resolved by the commit

Example:
```
feat(mobile): add onboarding carousel for first-time users

Shows escrow and cNGN explainer slides once on first launch.
Skippable via a localised Skip button. Uses AsyncStorage to
persist the seen flag.

Closes #446
```

---

## PR Checklist

Before opening a pull request, confirm each item:

- [ ] Branch is up to date with `upstream/main`
- [ ] `Closes #N` appears in the PR description for every resolved issue
- [ ] New code has corresponding unit tests
- [ ] No new TypeScript or ESLint errors (`npm run type-check`, `npm run lint`)
- [ ] Backend changes include migration files if the schema changed
- [ ] Mobile changes do not break existing navigation or auth flows
- [ ] Contract changes include updated tests and a storage-layout justification if slots changed
- [ ] PR title matches the Conventional Commits format
- [ ] PR description describes *what* changed, *why*, and links the relevant issue

---

## CI Gates

All PRs must pass the following CI gates defined in `.github/workflows/ci.yml`:

| Gate | Command | Scope |
|---|---|---|
| TypeScript type-check | `npm run type-check` | `frontend/`, `backend/`, `mobile/` |
| ESLint | `npm run lint` | all JS/TS packages |
| Unit tests | `npm test` | all packages |
| Contract build | `cargo build` | `contracts/amana_escrow` |
| Contract tests | `cargo test` | `contracts/amana_escrow` |
| Storage layout gate | automated | blocks contract PRs that change slot layout without justification |

A PR cannot be merged until all gates are green. If a gate fails on code that was already broken before your change, document it in the PR description as a pre-existing failure so reviewers can distinguish new regressions from existing ones.
