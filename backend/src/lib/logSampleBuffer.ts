/**
 * Bounded, in-process sample of recently emitted (post-redaction) log
 * lines. Fed by pino's `streamWrite` hook in middleware/logger.ts — i.e.
 * this captures exactly what actually reached the log sink, after
 * `redactPii` ran. That makes it the right source for a PII scanner: the
 * question isn't "does raw application data contain PII" (trivially yes),
 * it's "did the redaction pipeline actually strip it before it left the
 * process."
 *
 * This is process-local and resets on restart — fine for a single-instance
 * dev/staging setup or as a canary. A fleet-wide production deployment
 * should point the scanner (see lib/piiLeakScanner.ts) at the central log
 * aggregator (Loki/CloudWatch/Datadog) instead; swap `getRecentLogSample`
 * for a query against that store and the rest of the pipeline is unchanged.
 */

import { env } from '../config/env';

let buffer: string[] = [];

function capacity(): number {
  return env.PII_SCANNER_SAMPLE_SIZE;
}

export function recordLogLine(line: string): void {
  buffer.push(line);
  const max = capacity();
  if (buffer.length > max) {
    buffer = buffer.slice(buffer.length - max);
  }
}

export function getRecentLogSample(): string[] {
  return [...buffer];
}

/** Test-only: reset the buffer between scanner test cases. */
export function __clearLogSampleForTests(): void {
  buffer = [];
}
