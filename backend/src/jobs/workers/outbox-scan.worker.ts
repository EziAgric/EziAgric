/**
 * Scheduled job for periodic outbox consistency scanning
 * 
 * Runs on a configurable schedule (e.g., daily at 3am UTC)
 * to detect and report any missed event emissions.
 */

import { Job } from "bullmq";
import { appLogger } from "../../middleware/logger";
import { scanOutboxCompleteness, OutboxConsistencyReport } from "../../lib/outbox/outboxScanner";
import { alertService } from "../../services/alert.service";
import { prisma } from "../../lib/db";

export interface OutboxScanJobData {
  timeWindowMinutes?: number;
  alertOnGaps?: boolean;
}

/**
 * Process outbox consistency scan job
 */
export async function processOutboxScanJob(
  job: Job<OutboxScanJobData>,
): Promise<OutboxConsistencyReport> {
  const { timeWindowMinutes = 60, alertOnGaps = true } = job.data;

  appLogger.info(
    { jobId: job.id, timeWindowMinutes },
    "[OutboxScanJob] Starting",
  );

  try {
    const report = await scanOutboxCompleteness(timeWindowMinutes);

    // Log results
    appLogger.info(
      {
        jobId: job.id,
        totalScanned: report.totalTradesScanned,
        gapsFound: report.gapsDetected.length,
        summary: report.summary,
      },
      "[OutboxScanJob] Completed",
    );

    // Log report for audit trail (auditTrail model may not exist)
    // TODO: Save report to DB for audit trail when auditTrail model is available
    appLogger.info(
      {
        jobId: job.id,
        report: {
          totalTradesScanned: report.totalTradesScanned,
          gapsDetected: report.gapsDetected.length,
          summary: report.summary,
        },
      },
      "[OutboxScanJob] Report",
    );

    // Alert if critical gaps found
    if (alertOnGaps && report.summary.criticalGaps > 0) {
      await alertService.dispatch(
        "outbox_critical_gaps",
        `Critical outbox gaps detected: ${report.summary.criticalGaps} gaps found`,
        {
          gapCount: report.summary.criticalGaps,
          gaps: report.gapsDetected.filter((g) => g.severity === "critical"),
          scanTime: new Date().toISOString(),
        },
      );

      appLogger.error(
        {
          jobId: job.id,
          criticalGaps: report.summary.criticalGaps,
        },
        "[OutboxScanJob] CRITICAL: Gaps detected in outbox",
      );
    }

    // Warn if warning gaps found
    if (report.summary.warningGaps > 0) {
      appLogger.warn(
        {
          jobId: job.id,
          warningGaps: report.summary.warningGaps,
        },
        "[OutboxScanJob] WARNING: Gaps detected in outbox",
      );
    }

    return report;
  } catch (error) {
    appLogger.error(
      { jobId: job.id, error },
      "[OutboxScanJob] Failed",
    );

    // Alert on job failure
    await alertService.dispatch(
      "outbox_scan_failed",
      `Outbox consistency scan failed: ${String(error)}`,
      {
        jobId: job.id,
        error: String(error),
        scanTime: new Date().toISOString(),
      },
    );

    throw error;
  }
}

/**
 * Configuration for the outbox scan job
 * Register this in index.ts like:
 * 
 * await outboxScanQueue.add(
 *   "daily-scan",
 *   { timeWindowMinutes: 1440, alertOnGaps: true },
 *   {
 *     repeat: {
 *       pattern: "0 3 * * *", // Daily at 3am UTC
 *     },
 *   }
 * );
 */
export const OUTBOX_SCAN_CONFIG = {
  queueName: "outbox-consistency",
  jobName: "daily-scan",
  schedule: "0 3 * * *", // Daily at 3am UTC
  defaultData: {
    timeWindowMinutes: 1440, // Scan last 24 hours
    alertOnGaps: true,
  },
};
