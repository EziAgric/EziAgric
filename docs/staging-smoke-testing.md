# Staging Admin Route Smoke Testing Policy & Documentation

This document describes the purpose, execution flow, tested endpoints, deployment integration, and failure notification rules for the staging admin route smoke test.

---

## 1. Purpose

Admin route regressions (such as broken authentication middleware, misconfigured secret keys, or route mapping errors) can severely impact administrative oversight and system security if detected only after production deployment.

The Staging Admin Route Smoke Test (`scripts/staging-admin-smoke-test.sh`) runs automatically during staging deployment to guarantee:
1. Administrative health and key derivation endpoints respond correctly (`/health`).
2. Unauthenticated requests to protected admin routes are strictly rejected (`401 Unauthorized`).
3. Non-admin or invalid user tokens are strictly rejected (`403 Forbidden` / `401 Unauthorized`).
4. Read paths and readiness endpoints respond with valid HTTP status codes.

---

## 2. Tested Endpoints & Expected Response Codes

| Endpoint Path | Test Scenario | Expected HTTP Code | Verification Target |
|---------------|---------------|-------------------|----------------------|
| `GET /health` | Admin Key Health Check | `200 OK` | Verifies `checkAdminSigningKey` reports active key |
| `GET /api/admin/audit` | Unauthenticated Request | `401 Unauthorized` | Verifies `authMiddleware` enforcement |
| `GET /api/admin/audit` | Non-Admin / Invalid Token | `401 Unauthorized` or `403 Forbidden` | Verifies `adminMiddleware` authorization |
| `GET /health/ready` | Readiness Probe | `200 OK` or `503 Service Unavailable` | Verifies operational status |

---

## 3. Staging Deployment Integration

The smoke test is integrated directly into the staging deployment pipeline:
- **Local / Script Execution**: Included as Section `[7]` in `./scripts/staging-validate.sh`.
- **CI/CD Workflow**: Executed as a required step `Run Staging Admin Smoke Test` in `.github/workflows/staging.yml`.

### Execution Command
```bash
STAGING_URL="http://localhost:4000" ./scripts/staging-admin-smoke-test.sh
```

---

## 4. Failure Notifications & Alerting

If any of the smoke test assertions fail:
1. `scripts/staging-admin-smoke-test.sh` prints a formatted `🚨 [ADMIN SMOKE TEST ALERT]` block detailing the failed assertion, timestamp, and target environment.
2. The script returns exit code `1`, causing the GitHub Actions job to fail immediately.
3. `.github/workflows/staging.yml` triggers the failure step `Notify on Staging Validation or Smoke Test Failure` (`if: failure()`), outputting error diagnostics and populating the GitHub Actions `$GITHUB_STEP_SUMMARY`.
4. Automated notification hooks (Slack / Webhooks / Email) alert the on-call engineering team to prevent promotion to production.
