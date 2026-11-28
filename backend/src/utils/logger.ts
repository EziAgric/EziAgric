import { randomUUID } from 'crypto';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL || 'info').toLowerCase();
  if (raw in LEVELS) {
    return raw as LogLevel;
  }
  return 'info';
}

let currentLevel: LogLevel = resolveLevel();

/**
 * Override the active log level (defaults to LOG_LEVEL env var, then 'info').
 */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function getLogLevel(): LogLevel {
  return currentLevel;
}

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[currentLevel];
}

export interface LogContext {
  requestId?: string;
  userId?: string;
  tradeId?: string;
  durationMs?: number;
  [key: string]: unknown;
}

function serializeError(err: unknown): Record<string, unknown> | undefined {
  if (!err) {
    return undefined;
  }
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }
  return { message: String(err) };
}

function write(level: LogLevel, message: string, context: LogContext = {}, error?: unknown): void {
  if (!shouldLog(level)) {
    return;
  }

  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };

  const serialized = serializeError(error);
  if (serialized) {
    entry.error = serialized;
  }

  const line = JSON.stringify(entry);
  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => write('debug', message, context),
  info: (message: string, context?: LogContext) => write('info', message, context),
  warn: (message: string, context?: LogContext) => write('warn', message, context),
  error: (message: string, context?: LogContext, error?: unknown) =>
    write('error', message, context, error),
};

/**
 * Generate a correlation id for a request when the client did not supply one.
 */
export function generateRequestId(): string {
  return randomUUID();
}
