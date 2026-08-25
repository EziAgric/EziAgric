import { Worker, Job } from 'bullmq';
import { appLogger } from '../../middleware/logger';
import { createQueueConnection } from '../queue';
import { tradeExpiryService } from '../../services/tradeExpiry.service';

export interface TradeExpirySweepJobData {
  batchSize?: number;
}

export function createTradeExpiryWorker(): Worker<TradeExpirySweepJobData> {
  return new Worker<TradeExpirySweepJobData>(
    'trade-expiry',
    async (job: Job<TradeExpirySweepJobData>) => {
      const { batchSize = 100 } = job.data;
      appLogger.info({ jobId: job.id, batchSize }, 'Trade expiry sweep started');
      const result = await tradeExpiryService.sweepExpiredTrades(batchSize);
      appLogger.info({ jobId: job.id, ...result }, 'Trade expiry sweep completed');
      return result;
    },
    { connection: createQueueConnection() },
  );
}
