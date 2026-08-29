/**
 * Job Heartbeat Integration Guide & Example
 * 
 * This file demonstrates how to integrate job heartbeat monitoring
 * into existing and new job workers
 */

import { Job } from "bullmq";
import { jobHeartbeatService, JobType } from "../../services/jobHeartbeat.service";
import { withHeartbeat } from "../../jobs/heartbeat-wrapper";
import { appLogger } from "../../middleware/logger";

/**
 * OPTION 1: Using the withHeartbeat wrapper function
 * 
 * This is the simplest approach - wrap your existing processor
 */
export async function exampleReconciliationWorker(job: Job): Promise<void> {
  // Your existing job logic
  appLogger.info("[ReconciliationWorker] Starting reconciliation");
  // ... do work ...
  appLogger.info("[ReconciliationWorker] Reconciliation complete");
}

export const wrappedReconciliationWorker = withHeartbeat(
  JobType.RECONCILIATION,
  exampleReconciliationWorker,
);

/**
 * OPTION 2: Manual heartbeat calls in your processor
 * 
 * Use this if you need fine-grained control over heartbeat timing
 */
export async function exampleTradeExpiryWorker(job: Job): Promise<void> {
  const startTime = Date.now();

  try {
    // Ping job start
    await jobHeartbeatService.ping(JobType.TRADE_EXPIRY, {
      status: "started",
    });

    // Your job logic
    appLogger.info("[TradeExpiryWorker] Scanning for expired trades");

    const expiredCount = 42; // Result of your work

    // Ping job completion
    const duration = Date.now() - startTime;
    await jobHeartbeatService.ping(JobType.TRADE_EXPIRY, {
      status: "completed",
      result: { expiredTradesProcessed: expiredCount },
      duration,
    });

    appLogger.info(
      { expiredCount, durationMs: duration },
      "[TradeExpiryWorker] Complete",
    );
  } catch (error) {
    // Ping job failure
    const duration = Date.now() - startTime;
    await jobHeartbeatService.ping(JobType.TRADE_EXPIRY, {
      status: "failed",
      error: String(error),
      duration,
    });

    appLogger.error(
      { error, durationMs: duration },
      "[TradeExpiryWorker] Failed",
    );

    throw error;
  }
}

/**
 * OPTION 3: Class-based with decorator
 * 
 * Use this for OOP-style job handlers (future enhancement)
 */
export class WebhookJobHandler {
  async process(job: Job): Promise<void> {
    appLogger.info("[WebhookJobHandler] Processing webhook delivery");
    // ... webhook logic ...
  }
}

/**
 * INTEGRATION CHECKLIST FOR EXISTING JOB WORKERS
 * 
 * For each existing job worker, follow these steps:
 * 
 * 1. Identify the job type (reconciliation, trade-expiry, webhook, etc.)
 *    - Find the corresponding JobType enum in jobHeartbeat.service.ts
 * 
 * 2. Add heartbeat pinging:
 *    a) Add "started" ping at the beginning:
 *       await jobHeartbeatService.ping(JobType.YOUR_JOB, { status: "started" });
 * 
 *    b) Add "completed" ping on success:
 *       await jobHeartbeatService.ping(JobType.YOUR_JOB, {
 *         status: "completed",
 *         result: { /* your result data */ },
 *         duration: Date.now() - startTime,
 *       });
 * 
 *    c) Add "failed" ping on error:
 *       await jobHeartbeatService.ping(JobType.YOUR_JOB, {
 *         status: "failed",
 *         error: error.message,
 *         duration: Date.now() - startTime,
 *       });
 * 
 * 3. Test by running the job and verifying heartbeat in DB:
 *    SELECT * FROM JobHeartbeat WHERE jobType = 'your-job-type';
 * 
 * 4. Verify heartbeat dashboard shows the job:
 *    GET /health/jobs
 * 
 * EXAMPLE: Updating reconciliation.worker.ts
 * ============================================
 * 
 * Before:
 * ```
 * export async function processReconciliationJob(
 *   job: Job<ReconciliationJobData>,
 * ): Promise<ReconciliationResult> {
 *   const result = performReconciliation();
 *   return result;
 * }
 * ```
 * 
 * After:
 * ```
 * export async function processReconciliationJob(
 *   job: Job<ReconciliationJobData>,
 * ): Promise<ReconciliationResult> {
 *   const startTime = Date.now();
 * 
 *   try {
 *     // Ping job start
 *     await jobHeartbeatService.ping(JobType.RECONCILIATION, {
 *       status: "started",
 *     });
 * 
 *     // Your existing logic
 *     const result = performReconciliation();
 * 
 *     // Ping job completion
 *     await jobHeartbeatService.ping(JobType.RECONCILIATION, {
 *       status: "completed",
 *       result: { 
 *         discrepancies: result.discrepancies.length,
 *         resolved: result.resolved 
 *       },
 *       duration: Date.now() - startTime,
 *     });
 * 
 *     return result;
 *   } catch (error) {
 *     // Ping job failure
 *     await jobHeartbeatService.ping(JobType.RECONCILIATION, {
 *       status: "failed",
 *       error: error.message,
 *       duration: Date.now() - startTime,
 *     });
 *     throw error;
 *   }
 * }
 * ```
 * 
 * MONITORING
 * ==========
 * 
 * 1. Health dashboard: GET /health/jobs
 * 2. Specific job: GET /health/jobs/{jobType}
 * 3. Detailed analytics: GET /health/jobs/dashboard
 * 4. Manual reset failures: POST /health/jobs/{jobType}/reset-failures
 * 
 * ALERTING
 * ========
 * 
 * The system will automatically trigger alerts when:
 * - A job misses its heartbeat by more than the grace period (5 minutes)
 * - A job has 3+ consecutive failures
 * - A scheduler is detected as dead (all jobs stale)
 */

/**
 * Example: How to verify heartbeat in production
 */
export async function verifyHeartbeatIntegration(): Promise<void> {
  // Get all job health statuses
  const allHealth = await jobHeartbeatService.getAllJobHealth();

  console.log("Job Health Report:");
  console.log("==================");

  allHealth.forEach((job) => {
    const icon =
      job.status === "healthy"
        ? "✅"
        : job.status === "stale"
          ? "⚠️ "
          : "❌";

    console.log(`${icon} ${job.jobType}`);
    console.log(`   Status: ${job.status}`);
    console.log(`   Last Beat: ${job.lastHeartbeat.toISOString()}`);
    console.log(`   Next Expected: ${job.nextExpectedAt.toISOString()}`);
    console.log(`   Time Since: ${Math.floor(job.timeSinceLastBeat / 1000)}s`);
    console.log(`   Failures: ${job.failureCount}`);
    console.log();
  });
}

/**
 * Startup checklist
 * ================
 * 
 * In your backend/src/index.ts, add this during initialization:
 * 
 * // 1. Initialize job heartbeat registry
 * await jobHeartbeatService.initializeJobRegistry();
 * appLogger.info("[App] Job heartbeat registry initialized");
 * 
 * // 2. Start the job watchdog (runs every 2 minutes)
 * if (process.env.JOB_WATCHDOG_ENABLED !== "false") {
 *   await jobWatchdogQueue.add(
 *     "continuous",
 *     { checkInterval: 120000 },
 *     {
 *       repeat: {
 *         every: 120000, // Every 2 minutes
 *       },
 *     }
 *   );
 *   appLogger.info("[App] Job watchdog started");
 * }
 * 
 * // 3. Register the health routes
 * app.use("/health", createJobHealthRoutes());
 * appLogger.info("[App] Job health routes registered");
 */
