import pinoHttp from 'pino-http';
import pino from 'pino';
import type { Request } from 'express';
import { env } from '../config/env';
import { CORRELATION_ID_HEADER, REQUEST_ID_HEADER } from './correlationId.middleware';
import { redactPii } from '../lib/logRedaction';
import { recordLogLine } from '../lib/logSampleBuffer';

const isTest = env.NODE_ENV === 'test';

/**
 * Deep-redacts every object argument passed to a log call (appLogger.info({
 * phone, email, ... }, 'msg')) before it reaches serialization. This is the
 * single enforcement point for PII scrubbing — see lib/logRedaction.ts for
 * the denylist/pattern rules, and __tests__/logRedaction.test.ts +
 * __tests__/logger.pii.test.ts for the enforcement tests required by #233.
 */
function redactLogArgs(this: unknown, args: unknown[], method: (...a: unknown[]) => void): void {
  const redactedArgs = args.map((arg) =>
    arg !== null && typeof arg === 'object' ? redactPii(arg) : arg,
  );
  method.apply(this, redactedArgs);
}

/**
 * Feeds the bounded sample buffer that lib/piiLeakScanner.ts sweeps —
 * capturing lines *after* redaction, so the scanner verifies the pipeline
 * above actually worked rather than restating that raw data has PII in it.
 */
function sampleForPiiScanner(line: string): string {
  recordLogLine(line);
  return line;
}

export const appLogger = pino(
  isTest
    ? { level: 'silent', hooks: { logMethod: redactLogArgs } }
    : {
        level: env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport: {
          target: 'pino-pretty',
          options: { colorize: true },
        },
        hooks: { logMethod: redactLogArgs, streamWrite: sampleForPiiScanner },
      },
);

export default pinoHttp({
  logger: appLogger,
  // Attach correlation/request IDs to every log record produced by pino-http.
  customProps: (req) => ({
    correlationId: (req as any).correlationId,
    requestId: (req as any).requestId,
  }),
  // Expose the IDs in the response log as well.
  customSuccessMessage: (req, res) =>
    `${req.method} ${(req as any).url} ${res.statusCode}`,
  customErrorMessage: (req, res, err) =>
    `${req.method} ${(req as any).url} ${res.statusCode} – ${err.message}`,
  autoLogging: {
    ignore: (req) => {
      const url = (req as any).url ?? '';
      return !!url.match(/^\/health/) || !!url.match(/^\/api\/docs/);
    },
  },
  // Include correlation/request IDs in the serialised request object.
  serializers: {
    req(req) {
      return {
        method: req.method,
        url: req.url,
        [CORRELATION_ID_HEADER]: req.raw?.correlationId,
        [REQUEST_ID_HEADER]: req.raw?.requestId,
      };
    },
  },
});
