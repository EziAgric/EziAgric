# Graceful Shutdown

The backend performs an **ordered, logged, bounded** shutdown on `SIGTERM`/`SIGINT`
so that deploys and scale-downs do not drop webhook jobs or miss Soroban events.

Without this, every deployment ran the risk of:

- **Dropped in-flight webhook jobs** — BullMQ workers were cut off mid-job.
- **Event-listener gaps** — the Soroban polling loop was stopped fire-and-forget,
  losing the in-flight poll window and risking missed events between restarts.
- **Abrupt HTTP connection teardown** — in-flight requests were killed instantly,
  producing 5xx spikes during rolling deploys.

## Shutdown sequence

On signal, `ShutdownOrchestrator` (in `backend/src/lib/shutdown.ts`) runs these
steps in order:

1. **Set shutdown flag** — readiness probe (`/health/ready`) immediately returns
   `503`, so the load balancer stops routing traffic to this pod.
2. **Close HTTP server** — stops accepting new connections and **drains in-flight
   requests** up to the drain timeout.
3. **Drain event listener** — `EventListenerService.drain()` stops the poll loop
   and **awaits any in-flight poll** to complete, then logs the last-processed
   ledger cursor. On restart the loop **resumes from that cursor + 1** (no gap).
4. **Drain BullMQ workers** — the reconciliation and PII workers are closed via
   `worker.close()`, which **pauses new job pickup** and waits for active jobs.
   BullMQ jobs remain durable in Redis, so requeued/incomplete jobs resume after
   restart.
5. **Close queue producer connections** — the reconciliation/pii queues and all
   tracked queue Redis connections (see `closeAllQueueConnections`).
6. **Disconnect Redis** — the shared cache client.
7. **Disconnect Prisma/Postgres**.

Every step is bounded by `SHUTDOWN_DRAIN_TIMEOUT_MS` (default 20s). A hard
`SHUTDOWN_FORCE_EXIT_TIMEOUT_MS` (default 30s) timer guarantees the process exits
even if a step hangs — the whole sequence is guaranteed `< 30s`.

## Local development behavior

Sending `Ctrl+C` (SIGINT) or `kill` (SIGTERM) to `npm run dev` triggers the same
ordered sequence. You can observe it in the logs:

```
Shutdown sequence initiated
HTTP server drained
[EventListener] Drained { lastLedger: 12345 }
Service stopped { service: "reconciliation-worker" }
...
Shutdown complete — exiting
```

Because BullMQ jobs live in Redis and the event listener resumes from its cursor,
**no jobs or events are lost** across a local restart.

## Kubernetes behavior

The deployment manifest (`infra/k8s/backend-deployment.yaml`) is wired to the
shutdown sequence:

- **`startupProbe`** → `/health/startup` (critical deps + config + admin key).
- **`livenessProbe`** → `/health/live` (process-only, no I/O).
- **`readinessProbe`** → `/health/ready` (DB + Redis, and returns `503` once
  shutdown begins, de-listing the pod before the drain).
- **`preStop` hook** → sleeps 10s so the readiness probe has time to flip to
  `503` and the pod de-lists from the load balancer **before** SIGTERM fires.
- **`terminationGracePeriodSeconds: 45`** → comfortably covers the preStop sleep
  10s + the bounded `<30s` drain.

This means during a rolling deploy a terminating pod first stops receiving new
traffic (readiness flip), then drains in-flight requests and jobs. The rolling
update (`maxSurge: 1`, `maxUnavailable: 0`) guarantees a replacement pod is up
before the old one drains.

## Configuration

| Env var | Default | Description |
|---|---|---|
| `SHUTDOWN_DRAIN_TIMEOUT_MS` | `20000` | Per-step drain budget |
| `SHUTDOWN_FORCE_EXIT_TIMEOUT_MS` | `30000` | Hard deadline before `process.exit(1)` |

## Verification

A chaos-style integration test (`backend/src/__tests__/shutdown.graceful.test.ts`)
covers:

- Ordered, logged, bounded shutdown with in-flight services.
- Idempotent shutdown (double SIGTERM doesn't double-run).
- Force-exit when a service hangs.
- Event-listener drain returns the last cursor.
- Resume requests `startLedger = cursor + 1` after restart (no gap).

Run with `npm test`.
