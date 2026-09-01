#!/usr/bin/env bash
# grafana-deploy-annotation.sh — Post a deploy annotation to Grafana so
# deploys show up as vertical markers on infra/grafana/dashboards/golden-signals.json.
#
# Wired into CI as a best-effort, non-blocking post-deploy step: if
# GRAFANA_URL / GRAFANA_API_KEY aren't configured, this exits 0 without
# posting anything, so it never fails a deployment on its own.
#
# Usage:
#   GRAFANA_URL=https://grafana.example.com \
#   GRAFANA_API_KEY=glsa_xxx \
#   DEPLOY_ENV=staging \
#   DEPLOY_REF=$(git rev-parse --short HEAD) \
#   ./scripts/grafana-deploy-annotation.sh

set -euo pipefail

if [[ -z "${GRAFANA_URL:-}" || -z "${GRAFANA_API_KEY:-}" ]]; then
  echo "GRAFANA_URL/GRAFANA_API_KEY not set — skipping deploy annotation."
  exit 0
fi

DEPLOY_ENV="${DEPLOY_ENV:-unknown}"
DEPLOY_REF="${DEPLOY_REF:-unknown}"
TIME_MS=$(( $(date +%s) * 1000 ))

PAYLOAD=$(cat <<JSON
{
  "text": "Deploy: ${DEPLOY_ENV} @ ${DEPLOY_REF}",
  "tags": ["deploy", "${DEPLOY_ENV}"],
  "time": ${TIME_MS}
}
JSON
)

HTTP_CODE=$(curl -s -o /tmp/grafana-annotation-response.json -w "%{http_code}" \
  -X POST "${GRAFANA_URL%/}/api/annotations" \
  -H "Authorization: Bearer ${GRAFANA_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "${PAYLOAD}" || echo "000")

if [[ "$HTTP_CODE" =~ ^2 ]]; then
  echo "Deploy annotation posted to Grafana (HTTP $HTTP_CODE)."
else
  echo "Warning: Grafana annotation post returned HTTP $HTTP_CODE (non-fatal)."
  cat /tmp/grafana-annotation-response.json 2>/dev/null || true
fi

exit 0
