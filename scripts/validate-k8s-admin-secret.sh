#!/usr/bin/env bash
# validate-k8s-admin-secret.sh — Validates that the K8s Deployment's
# ADMIN_SECRET_KEY env var reference resolves to a key actually declared in
# the target Secret manifest (or live cluster Secret), catching drift where a
# manifest references a secret key that was never provisioned.
#
# Usage:
#   ./scripts/validate-k8s-admin-secret.sh [DEPLOYMENT_FILE] [SECRETS_FILE]
#
# Exit codes:
#   0 — Secret reference resolves
#   1 — Validation failed

set -euo pipefail

DEPLOYMENT_FILE="${1:-infra/k8s/backend-deployment.yaml}"
SECRETS_FILE="${2:-infra/k8s/secrets.yaml}"

echo "==============================================================="
echo "  Amana — K8s ADMIN_SECRET_KEY Reference Validation"
echo "==============================================================="

if [[ ! -f "$DEPLOYMENT_FILE" ]]; then
  echo "❌ Error: Deployment manifest not found at $DEPLOYMENT_FILE"
  exit 1
fi

echo ""
echo "[1/2] Checking $DEPLOYMENT_FILE for an ADMIN_SECRET_KEY secretKeyRef..."
if ! grep -A2 'name: ADMIN_SECRET_KEY' "$DEPLOYMENT_FILE" | grep -q 'secretKeyRef'; then
  echo "  ❌ Error: ADMIN_SECRET_KEY is not wired via secretKeyRef in $DEPLOYMENT_FILE"
  exit 1
fi

SECRET_NAME=$(grep -A3 'name: ADMIN_SECRET_KEY' "$DEPLOYMENT_FILE" | grep 'name:' | tail -1 | awk '{print $2}')
echo "  ✓ ADMIN_SECRET_KEY references Secret \"$SECRET_NAME\""

echo ""
echo "[2/2] Resolving the referenced key..."
if command -v kubectl >/dev/null 2>&1 && kubectl get secret "$SECRET_NAME" >/dev/null 2>&1; then
  if kubectl get secret "$SECRET_NAME" -o jsonpath='{.data.ADMIN_SECRET_KEY}' | grep -q .; then
    echo "  ✓ Live cluster Secret \"$SECRET_NAME\" contains ADMIN_SECRET_KEY"
    exit 0
  else
    echo "  ❌ Error: Live cluster Secret \"$SECRET_NAME\" is missing key ADMIN_SECRET_KEY"
    exit 1
  fi
fi

if [[ ! -f "$SECRETS_FILE" ]]; then
  echo "  ❌ Error: No live cluster access and no local manifest at $SECRETS_FILE to validate against"
  exit 1
fi

if grep -qE '^\s*ADMIN_SECRET_KEY:' "$SECRETS_FILE"; then
  echo "  ✓ $SECRETS_FILE declares ADMIN_SECRET_KEY"
else
  echo "  ❌ Error: $SECRETS_FILE does not declare ADMIN_SECRET_KEY"
  exit 1
fi

echo ""
echo "==============================================================="
echo "  ✅ K8s ADMIN_SECRET_KEY reference is valid!"
echo "==============================================================="
exit 0
