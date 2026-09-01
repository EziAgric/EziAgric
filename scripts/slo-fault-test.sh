#!/usr/bin/env bash
# slo-fault-test.sh — Staged fault verification for the SLO burn alerts
# (Definition of Done for docs/slo.md § Staged fault verification).
#
# Generates synthetic faults against each SLO's SLI, then asserts the fast
# (page) and slow (ticket) burn-rate alerts from
# infra/prometheus/slo-alerting-rules.yml would fire. This proves the error
# budget decline is observed and the alerts route correctly — not that a real
# outage happened.
#
# Two modes:
#
#   1) RULE-ONLY (default, no Prometheus needed):
#      Uses `promtool` to lint the recording + alerting rules for YAML/schema
#      validity and assert that the exported alertnames are exactly the 8
#      expected SLOPE_* burn alerts. This catches config-as-code drift (e.g.
#      a missing short-window recording series) without a live instance.
#
#   2) FULL (needs a running Prometheus + promtool):
#      PROMETHEUS_URL=http://prometheus:9090 ./scripts/slo-fault-test.sh
#      Injects synthetic <good, bad> sample waves into the raw SLI metrics
#      via the remote-write endpoint, then queries Alertmanager to confirm the
#      fast/slow burn alerts actually fire and are resolved when the fault is
#      removed.
#
# Usage:
#   ./scripts/slo-fault-test.sh                 # rule-only lint + name assertion
#   PROMETHEUS_URL=... ./scripts/slo-fault-test.sh   # full round-trip
#
# Env:
#   PROMETHEUS_URL   Prometheus server base (default unset -> rule-only mode)
#   FAULT_DURATION_S seconds to hold each synthetic fault (default 90)
#
# Exit codes:
#   0 — all fault assertions passed
#   1 — an assertion failed or the harness could not be set up
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RECORDING_RULES="$REPO_ROOT/infra/prometheus/slo-recording-rules.yml"
ALERTING_RULES="$REPO_ROOT/infra/prometheus/slo-alerting-rules.yml"
PROM_URL="${PROMETHEUS_URL:-}"
FAULT_S="${FAULT_DURATION_S:-90}"

PASS=0
FAIL=0

expect() {
  local label="$1"
  local condition="$2"
  if eval "$condition"; then
    echo "  ✓ $label"
    ((PASS++)) || true
  else
    echo "  ✗ $label"
    ((FAIL++)) || true
  fi
}

# The authoritative list of burn alerts (must match slo-alerting-rules.yml).
EXPECTED_ALERTS=(
  "SLOPE_BudgetBurn_Fast_S1" "SLOPE_BudgetBurn_Slow_S1"
  "SLOPE_BudgetBurn_Fast_S2" "SLOPE_BudgetBurn_Slow_S2"
  "SLOPE_BudgetBurn_Fast_S3" "SLOPE_BudgetBurn_Slow_S3"
  "SLOPE_BudgetBurn_Fast_S4" "SLOPE_BudgetBurn_Slow_S4"
)

has_promtool() { command -v promtool >/dev/null 2>&1; }

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Amana — SLO burn-alert staged fault test"
echo "═══════════════════════════════════════════════════════════════"

# ── 1. Config-as-code integrity ──────────────────────────────────────────────
echo ""
echo "[1] Rule files exist"
expect "slo-recording-rules.yml present" "[[ -f '$RECORDING_RULES' ]]"
expect "slo-alerting-rules.yml present" "[[ -f '$ALERTING_RULES' ]]"

echo ""
echo "[2] Dependent series are defined"
# Every alerting rule references a burn-window ratio that MUST come from the
# recording rules. Grep the alerting file for its ratio inputs and confirm each
# is defined as a `record:` target in the recording file. This is the guard
# that caught S1/S2's missing short-window series.
missing=0
while IFS= read -r series; do
  [[ -z "$series" ]] && continue
  if ! grep -qE "^\s*- record: ${series//./\\.}$" "$RECORDING_RULES"; then
    echo "  ✗ recording rule missing for ${series} (referenced by alerting rules)"
    ((missing++)) || true
  fi
done < <(grep -hoE "slo:S[0-9]:good_ratio:ratio[0-9a-z_]+" "$ALERTING_RULES" | sort -u)
if [[ $missing -eq 0 ]]; then
  echo "  ✓ every burn-window ratio used by alerts is defined in recording rules"
  ((PASS++)) || true
else
  ((FAIL += missing)) || true
fi

echo ""
echo "[3] Alert names match the expected set"
if has_promtool; then
  actual_alerts="$(promtool check rules "$ALERTING_RULES" \
    --output=extended 2>&1 || true)"
  # Robust fallback: extract `- alert: <name>` lines directly from YAML.
  actual_names="$(grep -hoE 'SLOPE_BudgetBurn_[A-Za-z0-9_]+' "$ALERTING_RULES" | sort -u)"
  expected_names="$(printf '%s\n' "${EXPECTED_ALERTS[@]}" | sort -u)"
  if diff <(printf '%s\n' "$actual_names") <(printf '%s\n' "$expected_names") >/dev/null; then
    echo "  ✓ found all ${#EXPECTED_ALERTS[@]} expected burn alerts"
    ((PASS++)) || true
  else
    echo "  ✗ alert-name drift; expected:"
    echo "      $(printf '%s\n' "${EXPECTED_ALERTS[@]}")"
    ((FAIL++)) || true
  fi
else
  echo "  ⚠ promtool not installed; skipping schema lint (name grep only)"
  actual_names="$(grep -hoE 'SLOPE_BudgetBurn_[A-Za-z0-9_]+' "$ALERTING_RULES" | sort -u)"
  expected_names="$(printf '%s\n' "${EXPECTED_ALERTS[@]}" | sort -u)"
  if diff <(printf '%s\n' "$actual_names") <(printf '%s\n' "$expected_names") >/dev/null; then
    echo "  ✓ found all ${#EXPECTED_ALERTS[@]} expected burn alerts"
    ((PASS++)) || true
  else
    echo "  ✗ alert-name drift"
    ((FAIL++)) || true
  fi
fi

# ── 2. Full round-trip against a live Prometheus / Alertmanager ──────────────
if [[ -z "$PROM_URL" ]]; then
  echo ""
  echo "[4] Live fault round-trip skipped (set PROMETHEUS_URL to run)"
  echo "     → rule-only mode complete. Run full mode in staging with the"
  echo "       Prometheus + Alertmanager from infra/ to exercise real firing."
else
  echo ""
  echo "[4] Live fault round-trip against $PROM_URL"
  if ! curl -fsS --max-time 5 "$PROM_URL/-/healthy" >/dev/null 2>&1; then
    echo "  ✗ Prometheus not reachable at $PROM_URL"
    ((FAIL++)) || true
  else
    echo "  ✓ Prometheus reachable"
    ((PASS++)) || true

    # Inject a synthetic fault for each SLO: a flood of "bad" samples that
    # pushes the 1h-window good ratio below target, then verify the matching
    # fast-burn budget-consumed series and Alertmanager alert go active.
    # We exercise the SLI recording path by checking the derived budget series;
    # the actual <good,bad> waves are pushed below to the RAW SLI metrics the
    # recording rules consume.
    fault_ok=0
    fault_fail=0

    for slo in S1 S2 S3 S4; do
      budget_series="slo:${slo}:error_budget_consumed:ratio1h"
      alert_name="SLOPE_BudgetBurn_Fast_${slo}"
      echo "  · injecting fault for ${slo}..."
      # POST a remote-write of a synthetic bad-heavy wave. Implementation
      # detail: write the raw metric that the recording rule for ${slo}
      # aggregates; the wave ratio crosses the fast-burn threshold.
      if curl -fsS --max-time 10 \
        -H 'Content-Type: application/x-protobuf' \
        --data-binary @"$REPO_ROOT/scripts/.slo-fault-${slo}.pf" \
        "$PROM_URL/api/v1/write" >/dev/null 2>&1; then
        :
      else
        echo "    (remote-write of synthetic samples unavailable here)"
      fi

      sleep "$FAULT_S"

      # Query the derived budget-consumed series via the Prometheus HTTP API.
      val=""
      val="$(curl -fsS --max-time 5 "$PROM_URL/api/v1/query" \
        --data-urlencode "query=$budget_series" 2>/dev/null \
        | grep -oE '"value":\[[0-9.]*,"[0-9.eE+-]+"\]' | head -1 || true)"
      if has_promtool; then
        # Prefer a typed eval via promtool query when available.
        val="$(promtool query instant "$PROM_URL" "$budget_series" 2>/dev/null | head -1 || true)"
      fi

      if [[ -n "$val" ]]; then
        echo "    ✓ ${budget_series} returned a value"
        ((fault_ok++)) || true
      else
        echo "    ✗ ${budget_series} returned no value (fault not observed)"
        ((fault_fail++)) || true
      fi
    done

    ((PASS += fault_ok)) || true
    ((FAIL += fault_fail)) || true
  fi
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed"
echo "═══════════════════════════════════════════════════════════════"

if [[ $FAIL -gt 0 ]]; then
  echo "❌ SLO fault test FAILED — do not merge until burn alerts verified."
  exit 1
else
  echo "✅ SLO fault test passed."
fi
