import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? 'info').toLowerCase();
  return (LEVELS as Record<string, number>)[raw] !== undefined ? (raw as LogLevel) : 'info';
}

const activeLevel = resolveLevel();

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[activeLevel];
}

function emit(level: LogLevel, payload: Record<string, unknown>): void {
  if (!shouldLog(level)) return;
  const line = JSON.stringify({ level, timestamp: new Date().toISOString(), ...payload });
  if (level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export const logger = {
  debug: (payload: Record<string, unknown>) => emit('debug', payload),
  info: (payload: Record<string, unknown>) => emit('info', payload),
  warn: (payload: Record<string, unknown>) => emit('warn', payload),
  error: (payload: Record<string, unknown>) => emit('error', payload),
};

type RequestWithContext = Request & {
  requestId?: string;
  user?: { id?: string };
  tradeId?: string;
};

export function requestLogger(req: RequestWithContext, res: Response, next: NextFunction): void {
  const headerId = req.headers['x-request-id'];
  const requestId =
    typeof headerId === 'string' && headerId.length > 0
      ? headerId
      : Array.isArray(headerId) && headerId.length > 0
        ? headerId[0]
        : randomUUID();

  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const payload: Record<string, unknown> = {
      method: req.method,
      path: req.originalUrl ?? req.path,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 1000) / 1000,
      requestId,
    };
    if (req.user?.id) payload.userId = req.user.id;
    if (req.tradeId) payload.tradeId = req.tradeId;

    const level: LogLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    emit(level, payload);
  });

  next();
}

export function logError(
  err: Error,
  req: RequestWithContext,
  extra: Record<string, unknown> = {},
): void {
  const payload: Record<string, unknown> = {
    message: err.message,
    stack: err.stack,
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl ?? req.path,
    ...extra,
  };
  if (req.user?.id) payload.userId = req.user.id;
  if (req.tradeId) payload.tradeId = req.tradeId;
  emit('error', payload);
}
