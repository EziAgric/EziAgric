# CI Policy: Admin Endpoint Regression Test Enforcement

This document describes the Continuous Integration (CI) policy enforcing mandatory regression test coverage for all pull requests modifying administrative code in the Amana repository.

---

## 1. Policy Overview

To prevent silent administrative regressions, any Pull Request or commit range modifying admin routes, controllers, middleware, or service logic **MUST** include corresponding new or updated unit/integration tests under `backend/src/__tests__/`.

---

## 2. Protected Code Paths

The CI policy monitors modifications to any file under the following path patterns:

- `backend/src/routes/admin*`
- `backend/src/controllers/admin*`
- `backend/src/middleware/admin*`
- `backend/src/services/admin*`

---

## 3. Enforcement Mechanism

Automated enforcement is performed by `./scripts/check-admin-test-coverage.sh` as part of the `backend` job in `.github/workflows/ci.yml`.

### Inspection Logic
1. The script runs `git diff --name-only` against `origin/main` (or the PR base branch).
2. It checks whether any protected admin source files were added or modified.
3. If admin source code was modified, it checks whether test files under `backend/src/__tests__/` (e.g. `admin*.test.ts`) were also added or updated.
4. If admin code was changed without test updates, the script outputs a policy violation error and exits with code `1`, blocking PR merge.

---

## 4. Pull Request & Release Checklist

All Pull Request descriptions automatically include the required checklist item via `.github/pull_request_template.md`:

```markdown
- [ ] **Admin Regression Tests**: If this PR modifies admin routes, controllers, middleware, or services, corresponding regression tests under `backend/src/__tests__/` have been added or updated (enforced by CI policy).
```

---

## 5. Developer Guide & Remediation

If CI fails with the message `POLICY VIOLATION: Admin code modified without test changes!`:

1. Identify the admin source file modified (e.g. `backend/src/routes/admin.audit.routes.ts`).
2. Add or update unit tests in `backend/src/__tests__/admin.audit.routes.test.ts` or create a new test file under `backend/src/__tests__/`.
3. Re-run local test validation:
   ```bash
   pnpm test
   ./scripts/check-admin-test-coverage.sh main
   ```
4. Push your commits to trigger re-evaluation by GitHub Actions.

---

## 6. Admin OpenAPI Documentation Gate

In addition to regression test coverage, the `backend` job runs a **Validate admin OpenAPI docs** step that executes `backend/src/__tests__/openapi.drift.test.ts` and `backend/src/__tests__/openapi.docs.test.ts`.

- `openapi.drift.test.ts` fails the build if an implemented route (including `/admin/*` and `/api/admin/*` paths) is missing from `backend/src/docs/openapi.yaml`, or vice versa.
- `openapi.docs.test.ts` fails the build if a documented admin path is missing required metadata (e.g. auth `security` requirements or admin-header parameters).

If this step fails, update `backend/src/docs/openapi.yaml` (and the generated `openapi.json`) to match the actual route surface before pushing again.
