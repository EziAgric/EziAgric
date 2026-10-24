/**
 * Shared frontend logger.
 *
 * Debug/info/warn output is only emitted in development and test so that
 * production builds never write tracing noise to the browser console.
 * Errors are always emitted.
 */

const isLoggingEnabled = (): boolean => process.env.NODE_ENV !== "production";

export const logger = {
  debug(...args: unknown[]): void {
    if (isLoggingEnabled()) console.debug(...args);
  },
  info(...args: unknown[]): void {
    if (isLoggingEnabled()) console.info(...args);
  },
  warn(...args: unknown[]): void {
    if (isLoggingEnabled()) console.warn(...args);
  },
  error(...args: unknown[]): void {
    console.error(...args);
  },
};
