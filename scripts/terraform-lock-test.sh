#!/usr/bin/env bash
# Terraform state-lock verification (Issue #267).
#
# Proves that a concurrent apply is BLOCKED by the DynamoDB state lock:
#   1. Writes a lock item exactly as a running `terraform apply` would
#      (conditional put — never clobbers a real lock held by someone else).
#   2. Runs `terraform plan -lock=true` against the same state and asserts it
#      fails with "Error acquiring the state lock".
#   3. Always removes the synthetic lock (conditional on our lock ID), even on
#      failure, so the test cannot leave the environment locked.
#
# Requires credentials that may write the lock table (the apply role).
#
# Usage: scripts/terraform-lock-test.sh <env>     (dev | staging)

set -euo pipefail

ENVIRONMENT="${1:?usage: terraform-lock-test.sh <env>}"
TF_DIR="infra/terraform/environments/${ENVIRONMENT}"
BUCKET="amana-terraform-state-${ENVIRONMENT}"
KEY="infra/terraform/${ENVIRONMENT}/terraform.tfstate"
TABLE="amana-terraform-locks-${ENVIRONMENT}"
LOCK_ID="${BUCKET}/${KEY}"
TEST_ID="lock-test-$(date +%s)-$$"

cleanup() {
  aws dynamodb delete-item \
    --table-name "$TABLE" \
    --key "{\"LockID\":{\"S\":\"${LOCK_ID}\"}}" \
    --condition-expression "contains(#i, :id)" \
    --expression-attribute-names '{"#i":"Info"}' \
    --expression-attribute-values "{\":id\":{\"S\":\"${TEST_ID}\"}}" \
    >/dev/null 2>&1 && echo "Synthetic lock removed." || echo "No synthetic lock to remove."
}
trap cleanup EXIT

echo "==> Initialising ${TF_DIR}"
terraform -chdir="$TF_DIR" init -input=false -reconfigure >/dev/null

INFO=$(printf '{"ID":"%s","Operation":"OperationTypeApply","Who":"ci-lock-test","Version":"lock-test","Created":"%s","Path":"%s"}' \
  "$TEST_ID" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$LOCK_ID")

echo "==> Acquiring synthetic lock ${TEST_ID}"
if ! aws dynamodb put-item \
  --table-name "$TABLE" \
  --item "{\"LockID\":{\"S\":\"${LOCK_ID}\"},\"Info\":{\"S\":$(printf '%s' "$INFO" | jq -Rs .)}}" \
  --condition-expression "attribute_not_exists(LockID)"; then
  echo "::error::State is already locked by someone else — refusing to run the test. See docs/runbooks/terraform-state-recovery.md"
  trap - EXIT
  exit 1
fi

echo "==> Attempting a concurrent operation (must be blocked)"
set +e
OUTPUT=$(terraform -chdir="$TF_DIR" plan -input=false -lock=true -lock-timeout=10s -refresh=false 2>&1)
STATUS=$?
set -e
echo "$OUTPUT" | tail -n 20

if [ "$STATUS" -ne 0 ] && echo "$OUTPUT" | grep -q "Error acquiring the state lock"; then
  echo "PASS: concurrent operation was blocked by the state lock."
  exit 0
fi

echo "::error::FAIL: concurrent operation was NOT blocked by the state lock (exit ${STATUS})."
exit 1
