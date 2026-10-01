# Kubernetes Capacity & Autoscaling

Covers `infra/k8s/*-deployment.yaml` resources, `infra/k8s/hpa.yaml` and `infra/k8s/pdb.yaml`.

## Sizing rules

| Setting | Rule |
|---------|------|
| `requests.cpu` / `requests.memory` | p50 usage per pod under the staging k6 profile (`k6/`) |
| `limits.memory` | p99 usage + 50% headroom (avoids OOMKill during GC / cold caches) |
| `limits.cpu` | p99 usage x 2 (bursty JSON serialization; throttling shows up as p95 latency) |
| HPA CPU target | 70% backend / 75% frontend, leaving room for the scale-up delay |
| Backend queue metric | `amana_event_queue_depth` average 50 per pod (via prometheus-adapter) |

## Current values

| Service | CPU req / limit | Mem req / limit | HPA min / max |
|---------|-----------------|-----------------|---------------|
| backend | 100m / 500m | 256Mi / 512Mi | 2 / 10 |
| frontend | 100m / 500m | 256Mi / 512Mi | 2 / 5 |

Scale-up stabilization is short (30–60s) so pilot bursts are absorbed; scale-down waits 300s and
removes at most one pod per 2 minutes to avoid flapping.

## Measuring / re-validating

1. Deploy to staging and run the k6 load profile at 3x expected pilot peak:
   `k6 run -e TARGET_RPS=60 k6/<scenario>.js`
2. Capture per-pod usage: `kubectl top pods -l app=backend --containers` (every 15s) or the
   Grafana "Pod resources" panel; record p50 / p99.
3. Update requests/limits per the rules above and refresh the table.
4. PDB check: during the run, `kubectl drain <node> --ignore-daemonsets` and confirm zero
   non-2xx responses in the k6 summary (`http_req_failed` = 0).
5. Record cost delta: `(new total requests - previous total requests) x node $/vCPU-hour`.

## Validation log

| Date | Peak RPS | p95 latency | Dropped reqs on drain | Cost delta | Reviewer |
|------|----------|-------------|-----------------------|------------|----------|
