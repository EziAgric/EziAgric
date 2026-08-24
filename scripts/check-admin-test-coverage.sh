#!/usr/bin/env bash
# check-admin-test-coverage.sh — Enforcement check for admin regression test coverage.
#
# Enforces that any Pull Request or commit modifying admin endpoints, services, or middleware
# includes corresponding test updates or additions.
#
# Usage:
#   ./scripts/check-admin-test-coverage.sh [BASE_REF]
#
# Exit codes:
#   0 — Admin code unchanged OR admin code changed with required test updates
#   1 — Admin code changed without corresponding test updates (CI failure)

set -euo pipefail

BASE_REF="${1:-${GITHUB_BASE_REF:-main}}"

echo "==============================================================="
echo "  Amana — CI Admin Regression Test Policy Enforcer"
echo "==============================================================="

# Determine diff target
if git rev-parse --verify "origin/$BASE_REF" >/dev/null 2>&1; then
  DIFF_TARGET="origin/$BASE_REF"
elif git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
  DIFF_TARGET="$BASE_REF"
else
  # Fallback for shallow clone or detached HEAD
  DIFF_TARGET="HEAD~1"
fi

echo "Comparing current HEAD against $DIFF_TARGET..."

# Extract changed files
CHANGED_FILES=$(git diff --name-only "$DIFF_TARGET"...HEAD 2>/dev/null || git diff --name-only HEAD~1 2>/dev/null || echo "")

if [[ -z "$CHANGED_FILES" ]]; then
  echo "  No file changes detected."
  exit 0
fi

# Filter for modified admin source files
ADMIN_SRC_CHANGES=$(echo "$CHANGED_FILES" | grep -E '^backend/src/(routes/admin|controllers/admin|middleware/admin|services/admin)' || true)

if [[ -z "$ADMIN_SRC_CHANGES" ]]; then
  echo "  ✓ No admin endpoint or service source files modified."
  echo "  CI admin regression test policy satisfied."
  exit 0
fi

echo ""
echo "Detected changes to admin source code:"
echo "$ADMIN_SRC_CHANGES" | sed 's/^/  - /'

# Check for corresponding test file changes
TEST_CHANGES=$(echo "$CHANGED_FILES" | grep -E '^backend/src/__tests__/(admin|\w+\.admin|\w+\.test\.ts|\w+\.spec\.ts)' || true)

if [[ -n "$TEST_CHANGES" ]]; then
  echo ""
  echo "✓ Corresponding test file changes detected:"
  echo "$TEST_CHANGES" | sed 's/^/  - /'
  echo ""
  echo "==============================================================="
  echo "  ✅ CI Admin Regression Test Policy passed!"
  echo "==============================================================="
  exit 0
else
  echo ""
  echo "==============================================================="
  echo "  ❌ POLICY VIOLATION: Admin code modified without test changes!"
  echo "==============================================================="
  echo "  Admin endpoint/service source files were modified, but no test"
  echo "  files under backend/src/__tests__/ were added or updated."
  echo ""
  echo "  Rule: Any PR altering admin routes, controllers, middleware, or services"
  echo "  MUST include new or updated regression tests in backend/src/__tests__/."
  echo ""
  echo "  Refer to docs/admin-ci-policy.md for details."
  echo "==============================================================="
  exit 1
fi
