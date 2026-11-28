/**
 * Job Watchdog Worker
 * 
 * Runs periodically to check all scheduled jobs for missed heartbeats
 * and trigger alerts if jobs are overdue or failing
 */

import { Job } from "bullmq";
import { jobHeartbeatService } from "../../services/jobHeartbeat.service";
import { appLogger } from "../../middleware/logger";

export interface JobWatchdogData {
  checkInterval?: number; // How often to run this watchdog (milliseconds)
}

/**
 * Process job watchdog check
 * Verifies all jobs have healthy heartbeats and triggers alerts if not
 */
export async function processJobWatchdog(
  job: Job<JobWatchdogData>,
): Promise<{
  healthy: number;
  stale: number;
  overdue: number;
  timestamp: string;
}> {
  appLogger.info(
    { jobId: job.id },
    "[JobWatchdog] Starting heartbeat check",
  );

  try {
    const health = await jobHeartbeatService.checkAllJobHealth();

    const result = {
      healthy: health.healthy.length,
      stale: health.stale.length,
      overdue: health.overdue.length,
      timestamp: new Date().toISOString(),
    };

    appLogger.info(
      result,
      "[JobWatchdog] Heartbeat check complete",
    );

    // Run detailed watchdog alert checks
    await jobHeartbeatService.watchdogCheck();

    return result;
  } catch (error) {
    appLogger.error(
      { jobId: job.id, error },
      "[JobWatchdog] Check failed",
    );
    throw error;
  }
}

/**
 * Configuration for the job watchdog
 * Register this in index.ts like:
 * 
 * await jobWatchdogQueue.add(
 *   "continuous",
 *   { checkInterval: 120000 }, // Every 2 minutes
 *   {
 *     repeat: {
 *       every: 120000, // Run every 2 minutes
 *     },
 *   }
 * );
 */
export const JOB_WATCHDOG_CONFIG = {
  queueName: "job-watchdog",
  jobName: "continuous",
  checkInterval: 2 * 60 * 1000, // Every 2 minutes
  defaultData: {
    checkInterval: 2 * 60 * 1000,
  },
};
