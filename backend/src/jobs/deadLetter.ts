import { Queue, Worker, Job } from 'bullmq';
import { createQueueConnection } from './queue';
import { appLogger } from '../middleware/logger';

export interface DeadLetterEntry {
  originalQueue: string;
  jobName: string;
  data: unknown;
  attemptsMade: number;
  errorClass: string;
  errorMessage: string;
  failedAt: string;
}

const DLQ_DEPTH_ALERT_THRESHOLD = Number(process.env.DLQ_DEPTH_ALERT_THRESHOLD ?? 50);

const dlqQueues = new Map<string, Queue<DeadLetterEntry>>();

export function getDeadLetterQueue(sourceQueueName: string): Queue<DeadLetterEntry> {
  let dlq = dlqQueues.get(sourceQueueName);
  if (!dlq) {
    dlq = new Queue<DeadLetterEntry>(`${sourceQueueName}-dlq`, {
      connection: createQueueConnection(),
    });
    dlqQueues.set(sourceQueueName, dlq);
  }
  return dlq;
}

/**
 * Wires a worker's `failed` event so jobs that have exhausted their retry
 * attempts land in a per-queue dead-letter queue with full failure context,
 * instead of silently vanishing into BullMQ's failed set.
 */
export function attachDeadLetterQueue(worker: Worker, sourceQueueName: string): void {
  worker.on('failed', async (job: Job | undefined, error: Error) => {
    if (!job) return;
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) return;

    const dlq = getDeadLetterQueue(sourceQueueName);
    await dlq.add('dead-letter', {
      originalQueue: sourceQueueName,
      jobName: job.name,
      data: job.data,
      attemptsMade: job.attemptsMade,
      errorClass: error.name,
      errorMessage: error.message,
      failedAt: new Date().toISOString(),
    });

    const depth = await dlq.count();
    appLogger.error(
      { sourceQueueName, jobId: job.id, error: error.message, dlqDepth: depth },
      'Job exhausted retries and moved to dead-letter queue',
    );
    if (depth >= DLQ_DEPTH_ALERT_THRESHOLD) {
      appLogger.error(
        { sourceQueueName, dlqDepth: depth, threshold: DLQ_DEPTH_ALERT_THRESHOLD },
        'ALERT: dead-letter queue depth exceeds threshold',
      );
    }
  });
}
