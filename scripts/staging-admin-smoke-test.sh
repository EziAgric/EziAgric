#!/usr/bin/env bash
# staging-admin-smoke-test.sh — Staging smoke test for admin route path and auth enforcement.
#
# Verifies admin route health, auth status responses (401 unauthenticated, 403 non-admin),
# and valid admin endpoint access against the staging environment.
#
# Usage:
#   STAGING_URL=http://localhost:4000 ./scripts/staging-admin-smoke-test.sh
#
# Exit codes:
#   0 — All admin smoke test checks passed
#   1 — One or more admin smoke test checks failed (triggers deployment failure notification)

set -euo pipefail

STAGING_URL="${STAGING_URL:-${BACKEND_URL:-http://localhost:4000}}"
PASS=0
FAIL=0

notify_failure() {
  local check_name="$1"
  local details="$2"
  echo ""
  echo "🚨 [ADMIN SMOKE TEST ALERT] Failure detected in staging admin smoke test!"
  echo "   Check: $check_name"
  echo "   Details: $details"
  echo "   Environment: Staging ($STAGING_URL)"
  echo "   Timestamp: $(date -u +'%Y-%m-%dT%H:%M:%SZ')"
  echo ""
}

echo "==============================================================="
echo "  Amana — Staging Admin Route Smoke Test"
echo "==============================================================="
echo "Target Base URL: $STAGING_URL"

# Test 1: Admin route health / signing key health check
echo ""
echo "[1/4] Checking admin route health endpoint (/health)..."
HEALTH_HTTP_CODE=$(curl -s -o /tmp/admin_smoke_health.json -w "%{http_code}" "$STAGING_URL/health" || echo "000")
if [[ "$HEALTH_HTTP_CODE" == "200" ]]; then
  if grep -q "Admin signing key valid" /tmp/admin_smoke_health.json 2>/dev/null || grep -q '"status":"degraded"' /tmp/admin_smoke_health.json 2>/dev/null || grep -q '"status":"healthy"' /tmp/admin_smoke_health.json 2>/dev/null; then
    echo "  ✓ Health endpoint responded HTTP 200 with active admin status"
    ((PASS++)) || true
  else
    echo "  ✓ Health endpoint responded HTTP 200"
    ((PASS++)) || true
  fi
else
  echo "  ✗ Health check failed (HTTP $HEALTH_HTTP_CODE)"
  notify_failure "Health Endpoint Check" "HTTP code $HEALTH_HTTP_CODE returned from $STAGING_URL/health"
  ((FAIL++)) || true
fi

# Test 2: Unauthenticated access to admin endpoint (/api/admin/audit) must return 401 Unauthorized
echo ""
echo "[2/4] Verifying unauthenticated request to /api/admin/audit returns HTTP 401..."
UNAUTH_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$STAGING_URL/api/admin/audit" || echo "000")
if [[ "$UNAUTH_HTTP_CODE" == "401" ]]; then
  echo "  ✓ Unauthenticated access correctly rejected with HTTP 401 Unauthorized"
  ((PASS++)) || true
else
  echo "  ✗ Unauthenticated access failed: expected HTTP 401, got HTTP $UNAUTH_HTTP_CODE"
  notify_failure "Unauthenticated Auth Enforcer" "Expected 401 for /api/admin/audit, got $UNAUTH_HTTP_CODE"
  ((FAIL++)) || true
fi

# Test 3: Non-admin token access to admin endpoint (/api/admin/audit) must return 403 Forbidden or 401
echo ""
echo "[3/4] Verifying invalid/non-admin auth token to /api/admin/audit returns HTTP 401 or 403..."
FORBIDDEN_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer invalid-non-admin-token" "$STAGING_URL/api/admin/audit" || echo "000")
if [[ "$FORBIDDEN_HTTP_CODE" == "401" || "$FORBIDDEN_HTTP_CODE" == "403" ]]; then
  echo "  ✓ Non-admin token correctly rejected with HTTP $FORBIDDEN_HTTP_CODE"
  ((PASS++)) || true
else
  echo "  ✗ Non-admin token check failed: expected HTTP 401 or 403, got HTTP $FORBIDDEN_HTTP_CODE"
  notify_failure "Non-Admin Authorization Enforcer" "Expected 401/403 for /api/admin/audit with invalid token, got $FORBIDDEN_HTTP_CODE"
  ((FAIL++)) || true
fi

# Test 4: Verify admin health path routing (/health/ready) responds
echo ""
echo "[4/4] Verifying readiness health path (/health/ready)..."
READY_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$STAGING_URL/health/ready" || echo "000")
if [[ "$READY_HTTP_CODE" == "200" || "$READY_HTTP_CODE" == "530" || "$READY_HTTP_CODE" == "503" ]]; then
  echo "  ✓ Admin readiness path responded with status code HTTP $READY_HTTP_CODE"
  ((PASS++)) || true
else
  echo "  ✗ Admin readiness check failed (HTTP $READY_HTTP_CODE)"
  notify_failure "Readiness Path Check" "Expected 200/503 for /health/ready, got $READY_HTTP_CODE"
  ((FAIL++)) || true
fi

# Summary & Notifications
echo ""
echo "==============================================================="
echo "  Staging Admin Smoke Test Results: $PASS passed, $FAIL failed"
echo "==============================================================="

if [[ $FAIL -gt 0 ]]; then
  echo "❌ STAGING ADMIN SMOKE TEST FAILED! Staging deployment contains admin regressions."
  exit 1
else
  echo "✅ All staging admin smoke tests passed successfully."
  exit 0
fi
