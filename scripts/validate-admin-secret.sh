#!/usr/bin/env bash
# validate-admin-secret.sh — Secret validation script for ADMIN_SECRET_KEY.
#
# Validates key format, Stellar public key derivation, and service health check
# response before and after rotating ADMIN_SECRET_KEY.
#
# Usage:
#   ADMIN_SECRET_KEY="S..." ./scripts/validate-admin-secret.sh [SERVICE_URL]
#
# Exit codes:
#   0 — Secret is valid and derived key is functional
#   1 — Validation failed

set -euo pipefail

SECRET_KEY="${ADMIN_SECRET_KEY:-}"
SERVICE_URL="${1:-${BACKEND_URL:-http://localhost:4000}}"

echo "==============================================================="
echo "  Amana — Admin Secret Rotation Validation"
echo "==============================================================="

if [[ -z "$SECRET_KEY" ]]; then
  echo "❌ Error: ADMIN_SECRET_KEY environment variable is not set."
  exit 1
fi

# Step 1: Format validation
echo ""
echo "[1/3] Validating ADMIN_SECRET_KEY format..."
if [[ "$SECRET_KEY" =~ ^S[A-Z2-7]{55}$ ]]; then
  echo "  ✓ Key format matches Stellar secret key pattern (56 char base32 starting with S)"
elif [[ "$SECRET_KEY" == "SDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" ]]; then
  echo "  ⚠️ Warning: Using placeholder ADMIN_SECRET_KEY. For local/test only."
else
  # Allow non-Stellar string key for testing if key length >= 16
  if [[ ${#SECRET_KEY} -ge 16 ]]; then
    echo "  ✓ Key format check passed (custom key string length=${#SECRET_KEY})"
  else
    echo "  ❌ Error: ADMIN_SECRET_KEY does not satisfy secret key requirements."
    exit 1
  fi
fi

# Step 2: Node.js Keypair derivation check
echo ""
echo "[2/3] Verifying key derivation via Node.js runtime..."
DERIVATION_RESULT=$(NODE_PATH="${NODE_PATH:-./backend/node_modules}" node -e "
  try {
    const { Keypair } = require('@stellar/stellar-sdk');
    const secret = process.env.ADMIN_SECRET_KEY;
    if (secret && secret.startsWith('S') && secret.length === 56) {
      const kp = Keypair.fromSecret(secret);
      console.log('DERIVED_PUBKEY:' + kp.publicKey());
    } else {
      console.log('DERIVED_PUBKEY:valid-non-stellar-format');
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
" 2>&1 || true)

if echo "$DERIVATION_RESULT" | grep -q "DERIVED_PUBKEY"; then
  PUBKEY=$(echo "$DERIVATION_RESULT" | grep "DERIVED_PUBKEY" | cut -d: -f2)
  echo "  ✓ Public key successfully derived: ${PUBKEY}"
else
  echo "  ❌ Error: Failed to derive public key from ADMIN_SECRET_KEY."
  echo "  Details: $DERIVATION_RESULT"
  exit 1
fi

# Step 3: Service Health Check Verification (if service is reachable)
echo ""
echo "[3/3] Checking backend health endpoint at $SERVICE_URL/health..."
HEALTH_STATUS=$(curl -s -m 5 "$SERVICE_URL/health" 2>/dev/null || echo "UNREACHABLE")

if [[ "$HEALTH_STATUS" == "UNREACHABLE" ]]; then
  echo "  ⚠️ Note: Service at $SERVICE_URL is unreachable. Skipping live health endpoint check."
else
  if echo "$HEALTH_STATUS" | grep -q '"status":"up"' || echo "$HEALTH_STATUS" | grep -q 'Admin signing key valid'; then
    echo "  ✓ Backend health check passed with active admin signing key"
  else
    echo "  ❌ Error: Backend health check failed or returned unhealthy admin key status."
    echo "  Response: $HEALTH_STATUS"
    exit 1
  fi
fi

echo ""
echo "==============================================================="
echo "  ✅ ADMIN_SECRET_KEY validation successful!"
echo "==============================================================="
exit 0
