/**
 * slo-snapshot.ts
 *
 * Weekly SLO snapshot gatherer (docs/slo.md). Queries the Prometheus recording
 * rules for each SLO's current good-ratio and error-budget consumption and
 * appends one JSON row per SLO to a JSONL file, so the SLO review meeting and
 * trend dashboards have a durable source of truth independent of Prometheus
 * retention.
 *
 * Usage:
 *   PROMETHEUS_URL=https://prometheus.example.com \
 *   SLO_SNAPSHOT_FILE=slo-snapshots/slo-snapshot.jsonl \
 *   npx tsx scripts/slo-snapshot.ts
 *
 * Env:
 *   PROMETHEUS_URL   Prometheus HTTP API base (default http://localhost:9090)
 *   SLO_SNAPSHOT_FILE output path, appended (default
 *                    ../slo-snapshots/slo-snapshot.jsonl)
 *
 * Exit codes:
 *   0 — all SLOs queried and appended
 *   1 — a query failed or the output file could not be written
 */

import { appendFileSync } from "fs";
import { resolve } from "path";

const PROMETHEUS_URL = process.env.PROMETHEUS_URL || "http://localhost:9090";
const SNAPSHOT_FILE =
  process.env.SLO_SNAPSHOT_FILE ||
  resolve(__dirname, "../../slo-snapshots/slo-snapshot.jsonl");

/** SLO id -> recording-rule series that carries the budget-consumed + burn-window values. */
const SLOS: Record<string, { ratio: string; budget: string; burn1h?: string; burn6h?: string }[]> = {
  S1: [{
    ratio: "slo:S1:good_ratio:ratio_rate28d",
    budget: "slo:S1:error_budget_consumed:ratio28d",
    burn1h: "slo:S1:error_budget_consumed:ratio1h",
    burn6h: "slo:S1:error_budget_consumed:ratio6h",
  }],
  S2: [{
    ratio: "slo:S2:good_ratio:ratio_rate28d",
    budget: "slo:S2:error_budget_consumed:ratio28d",
    burn1h: "slo:S2:error_budget_consumed:ratio1h",
    burn6h: "slo:S2:error_budget_consumed:ratio6h",
  }],
  S3: [{
    ratio: "slo:S3:good_ratio:ratio28d",
    budget: "slo:S3:error_budget_consumed:ratio28d",
    burn1h: "slo:S3:error_budget_consumed:ratio1h",
    burn6h: "slo:S3:error_budget_consumed:ratio6h",
  }],
  S4: [{
    ratio: "slo:S4:good_ratio:ratio_rate28d",
    budget: "slo:S4:error_budget_consumed:ratio28d",
    burn1h: "slo:S4:error_budget_consumed:ratio1h",
    burn6h: "slo:S4:error_budget_consumed:ratio6h",
  }],
};

interface SnapshotRow {
  ts: string;
  slo: string;
  good_ratio: number;
  budget_consumed: number;
  window: string;
  /** Fast-burn (1h) budget-consumption rate; >1200 would page. */
  burn_rate_1h?: number;
  /** Slow-burn (6h) budget-consumption rate; >9.3 would ticket. */
  burn_rate_6h?: number;
}

async function queryPrometheus(metric: string): Promise<number | null> {
  const url = `${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(metric)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Prometheus query failed (${res.status}) for ${metric}`);
  }
  const body = (await res.json()) as {
    status: string;
    data?: { result?: Array<{ value?: [number, string] }> };
  };
  if (body.status !== "success" || !body.data?.result?.length) {
    return null;
  }
  const value = body.data.result[0].value?.[1];
  return value === undefined ? null : Number(value);
}

async function run(): Promise<void> {
  const ts = new Date().toISOString();
  const rows: SnapshotRow[] = [];

  for (const [slo, selectors] of Object.entries(SLOS)) {
    for (const sel of selectors) {
      const goodRatio = await queryPrometheus(sel.ratio);
      const budgetConsumed = await queryPrometheus(sel.budget);
      if (goodRatio === null || budgetConsumed === null) {
        throw new Error(`No data yet for ${slo} (${sel.budget})`);
      }
      // Burn-window rates are best-effort: absent early on (before the
      // short-window series have data) they are omitted rather than failing
      // the snapshot. Present means the alert path is live.
      const burnRate1h = sel.burn1h ? await queryPrometheus(sel.burn1h) : null;
      const burnRate6h = sel.burn6h ? await queryPrometheus(sel.burn6h) : null;
      rows.push({
        ts,
        slo,
        good_ratio: goodRatio,
        budget_consumed: budgetConsumed,
        window: "28d",
        ...(burnRate1h !== null ? { burn_rate_1h: burnRate1h } : {}),
        ...(burnRate6h !== null ? { burn_rate_6h: burnRate6h } : {}),
      });
    }
  }

  const lines = rows.map((r) => `${JSON.stringify(r)}\n`).join("");
  appendFileSync(SNAPSHOT_FILE, lines);
  console.log(`Appended ${rows.length} SLO snapshot row(s) to ${SNAPSHOT_FILE}`);
}

run().catch((err) => {
  console.error(err && err.message ? err.message : String(err));
  process.exit(1);
});
