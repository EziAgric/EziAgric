# Branch Protection Policy

> Closes #479 (SEC-001)

## Protected Branches

| Branch    | Protection Level |
|-----------|-----------------|
| `main`    | Required checks + no direct push |
| `develop` | Required checks + no direct push |

## Required Status Checks

All of the following checks **must pass** before a PR can be merged into `main` or `develop`.
None of these checks use `continue-on-error`; a failure blocks the merge.

| Check Name                  | Workflow File          | Stack      | What It Validates                                      |
|-----------------------------|------------------------|------------|--------------------------------------------------------|
| `Frontend Required Gate`    | `.github/workflows/ci.yml` | `frontend/` | `npm ci`, `npm run lint`, `npm run build`          |
| `Backend Required Gate`     | `.github/workflows/ci.yml` | `backend/`  | `npm ci`, `npm run build`, representative smoke suite (auth, trade, events, validation) |
| `Contracts Required Gate`   | `.github/workflows/ci.yml` | `contracts/` | `cargo test`                                      |

Path-aware skipping is enabled via `dorny/paths-filter`. When a stack has no changed files the
gate emits a skip note and exits 0, so branch protection is satisfied without running unnecessary
work.

## Repository Settings (GitHub)

Navigate to **Settings → Branches → Branch protection rules** and configure the following for
both `main` and `develop`:

- [x] **Require a pull request before merging**
  - [x] Require approvals: 1 (minimum)
  - [x] Dismiss stale pull request approvals when new commits are pushed
- [x] **Require status checks to pass before merging**
  - [x] Require branches to be up to date before merging
  - Required checks (add each by exact name):
    - `Frontend Required Gate`
    - `Backend Required Gate`
    - `Contracts Required Gate`
- [x] **Require signed commits**
- [x] **Require linear history** (and under **Settings → General → Pull Requests**, disable
  "Allow merge commits"; keep only squash and rebase merging)
- [x] Add `Commit Provenance` (from `.github/workflows/commit-provenance.yml`) as a required check
- [x] **Do not allow bypassing the above settings** (applies to admins too)

## Commit Signing

### Contributor setup (SSH signing, recommended)

```sh
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global commit.gpgsign true
git config --global tag.gpgsign true
```

Then add the same public key on GitHub under **Settings → SSH and GPG keys → New SSH key** with
key type **Signing Key**. GPG works too (`gpg --full-generate-key`, `git config --global
user.signingkey <KEYID>`, upload the armored public key). Verify locally with
`git log --show-signature -1`; on GitHub the commit must show **Verified**.

### CI / bot commits

- Squash/rebase merges performed through the GitHub UI are signed by GitHub automatically.
- Workflows that push commits must use the GitHub API (e.g. `gh api` / createCommit) with
  `GITHUB_TOKEN` or a GitHub App token, which GitHub signs — never a raw `git push` of an
  unsigned local commit.
- Dependabot commits are signed by GitHub.

### Enforcement

- `.github/workflows/commit-provenance.yml` fails a PR if any commit is unverified or is a merge
  commit, so problems surface before merge rather than at push time.
- `sbom.yml` / release workflows should run `gh api repos/{owner}/{repo}/commits/<sha> --jq
  .commit.verification.verified` on the tagged commit and fail when it is not `true`.

### Migration note for open PRs

PRs opened before rollout that contain unsigned or merge commits must be rebased and re-signed:

```sh
git fetch origin && git rebase --exec 'git commit --amend --no-edit -S' origin/main
git push --force-with-lease
```

Alternatively, maintainers can squash-merge — the resulting commit is signed by GitHub.

## What Is Explicitly Prohibited

- `continue-on-error: true` on any step that is part of a required gate.
- Merging directly to `main` or `develop` without a PR.
- Skipping required checks via `[skip ci]` commit messages on protected branches.
- Unsigned commits or merge commits on `main` / `develop`.

## Periodic Verification Checklist

Run this checklist after any change to `.github/workflows/ci.yml` or repository settings:

1. Open **Settings → Branches** and confirm the three required checks are listed under each
   protected branch rule.
2. Grep the workflow file for `continue-on-error` — the result must be empty for required gate
   jobs:
   ```sh
   grep -n 'continue-on-error' .github/workflows/ci.yml
   # Expected: no output (or only lines inside non-required jobs)
   ```
3. Open a draft PR that intentionally breaks a lint rule and confirm the `Frontend Required Gate`
   check fails and the merge button is blocked.
4. Confirm the `Backend Required Gate` runs the full smoke suite (auth, trade, events,
   validation) by inspecting the CI log for the expected test file names.
5. Negative test: push an unsigned commit directly to `main` (`git -c commit.gpgsign=false commit
   --allow-empty -m test && git push origin HEAD:main`) and confirm GitHub rejects it; confirm
   `git log --merges origin/main --since=<rollout date>` is empty.
6. Record the date of verification and the GitHub username of the reviewer in the table below.

## Verification Log

| Date       | Verified By | Notes                        |
|------------|-------------|------------------------------|
| 2026-04-27 | devJaja     | Initial policy establishment |
