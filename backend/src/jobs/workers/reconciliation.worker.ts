/**
 * BullMQ worker for daily account reconciliation.
 *
 * Processes the "reconciliation" queue, running a full sweep comparing
 * off-chain ledger state against on-chain balances. Failures raise alerts
 * via the alert service (monitor the monitor pattern).
 */

import { Worker, Job } from "bullmq";
import { appLogger } from "../../middleware/logger";
import { createQueueConnection } from "../queue";
import { dailyReconciliationService } from "../../services/dailyReconciliation.service";

export interface ReconciliationSweepJobData {
  sweepId?: string;
}

export function createReconciliationWorker(): Worker<ReconciliationSweepJobData> {
  return new Worker<ReconciliationSweepJobData>(
    "reconciliation",
    async (job: Job<ReconciliationSweepJobData>) => {
      const { sweepId = job.id } = job.data;
      appLogger.info({ jobId: job.id, sweepId }, "Reconciliation sweep started");

      try {
        const result = await dailyReconciliationService.sweep();
        appLogger.info(
          { jobId: job.id, ...result },
          "Reconciliation sweep completed",
        );
        return result;
      } catch (error) {
        appLogger.error(
          { jobId: job.id, error },
          "Reconciliation sweep failed — alert should have been dispatched",
        );
        throw error;
      }
    },
    { connection: createQueueConnection() },
  );
}
