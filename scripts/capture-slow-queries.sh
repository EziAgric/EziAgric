#!/usr/bin/env bash
# capture-slow-queries.sh — Report the top-N slowest queries from pg_stat_statements.
# Requires postgres-staging (or prod) to be running with
# shared_preload_libraries=pg_stat_statements (see docker-compose.yml).
#
# Usage:
#   DATABASE_URL=postgresql://... ./scripts/capture-slow-queries.sh [TOP_N]
set -euo pipefail

TOP_N="${1:-20}"
DB_URL="${DATABASE_URL:-postgresql://postgres:staging-password@localhost:5434/amana_staging}"

psql "$DB_URL" -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;" >/dev/null

echo "=== Top $TOP_N offenders by total execution time ==="
psql "$DB_URL" -P pager=off <<SQL
SELECT
  round(total_exec_time::numeric, 2) AS total_ms,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  calls,
  left(query, 120) AS query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT $TOP_N;
SQL

echo ""
echo "For any offender above: run EXPLAIN (ANALYZE, BUFFERS) on the query,"
echo "propose an index migration via 'npx prisma migrate dev', and apply with"
echo "./scripts/migrate-safe.sh. See docs/query-performance-review.md."
