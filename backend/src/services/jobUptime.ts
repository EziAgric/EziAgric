/**
 * Job Uptime Calculation
 *
 * Derives uptime percentages for scheduled jobs from the rolling heartbeat
 * history stored in JobHeartbeatEvent.
 *
 * Model: the window is split into consecutive slots of the job's expected
 * interval, counted backwards from "now". A slot is "up" when at least one
 * `completed` heartbeat landed in it (with a small grace period to absorb
 * scheduling jitter). Uptime = up slots / total slots.
 *
 * Limitations:
 * - History is only recorded from the moment the JobHeartbeatEvent table
 *   exists, and is pruned after HEARTBEAT_HISTORY_RETENTION_MS. When a job has
 *   less history than the requested window, only the tracked portion is
 *   measured.
 * - Jobs with no recorded history at all are excluded; when no job has
 *   history the uptime value is `null` (unknown), never a fabricated 0.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Grace period applied to each slot (matches the heartbeat watchdog). */
export const UPTIME_SLOT_GRACE_MS = 5 * 60 * 1000;

/**
 * How long heartbeat events are retained. Slightly longer than the largest
 * dashboard window (7 days) so daily jobs keep a full window of history.
 */
export const HEARTBEAT_HISTORY_RETENTION_MS = 8 * DAY_MS;

export interface HeartbeatEventSample {
  jobType: string;
  status: string;
  recordedAt: Date;
}

/**
 * Compute uptime (0–100) for a single job over the given window.
 * Returns null when the job has no recorded history.
 */
export function computeJobUptime(
  events: HeartbeatEventSample[],
  intervalMs: number,
  windowMs: number,
  now: number = Date.now(),
): number | null {
  if (events.length === 0 || intervalMs <= 0) return null;

  const trackingStart = Math.min(...events.map((e) => e.recordedAt.getTime()));
  const windowStart = Math.max(now - windowMs, trackingStart);
  const slotCount = Math.max(1, Math.ceil((now - windowStart) / intervalMs));

  const upSlots = new Set<number>();
  for (const event of events) {
    if (event.status !== "completed") continue;

    const age = Math.max(0, now - event.recordedAt.getTime());
    const slot = Math.floor(age / intervalMs);
    if (slot < slotCount) upSlots.add(slot);

    // A completion slightly late for the previous slot still counts for it.
    if (slot > 0 && age - slot * intervalMs <= UPTIME_SLOT_GRACE_MS) {
      upSlots.add(slot - 1);
    }
  }

  return (upSlots.size / slotCount) * 100;
}

/**
 * Compute the average uptime across all jobs that have history.
 * Returns null when no job has any recorded history.
 */
export function computeAggregateUptime(
  jobs: Array<{ jobType: string; intervalMs: number }>,
  events: HeartbeatEventSample[],
  windowMs: number,
  now: number = Date.now(),
): number | null {
  const values = jobs
    .map((job) =>
      computeJobUptime(
        events.filter((e) => e.jobType === job.jobType),
        job.intervalMs,
        windowMs,
        now,
      ),
    )
    .filter((value): value is number => value !== null);

  if (values.length === 0) return null;

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.round(average * 100) / 100;
}
