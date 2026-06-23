import { Request, Response, NextFunction } from "express";
import { ErrorCode, StructuredErrorPayload, isAppError } from "./errorCodes";
import { z } from "zod";
import { env } from "../config/env";
import { appLogger } from "../middleware/logger";

function isZodError(err: unknown): err is { errors: unknown[] } {
  return err instanceof z.ZodError;
}

function handleError(err: unknown): StructuredErrorPayload {
  if (isAppError(err)) {
    return {
      code: err.code,
      message: err.message,
      details: err.details,
      timestamp: new Date().toISOString(),
    };
  }

  if (isZodError(err)) {
    return {
      code: ErrorCode.VALIDATION_ERROR,
      message: "Validation failed",
      details: { errors: err.errors },
      timestamp: new Date().toISOString(),
    };
  }

  const errForLogging = err instanceof Error ? err : new Error(String(err));
  return {
    code: ErrorCode.INTERNAL_ERROR,
    message: env.NODE_ENV === "production" ? "Internal server error" : errForLogging.message,
    details: {},
    timestamp: new Date().toISOString(),
  };
}

export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const requestId = (req.headers["x-request-id"] as string) || undefined;
  const correlationId = (req.headers["x-correlation-id"] as string) || undefined;
  const path = req.path;

  const payload = handleError(err);
  
  // Add request context to payload
  const fullPayload = {
    ...payload,
    path,
    ...(requestId && { requestId }),
    ...(correlationId && { correlationId }),
  };

  // Log appropriately
  if (isAppError(err)) {
    appLogger.warn({
      code: err.code,
      message: err.message,
      requestId,
      details: err.details,
    }, "AppError handled");
    return res.status(err.statusCode).json(fullPayload);
  }

  if (isZodError(err)) {
    return res.status(400).json(fullPayload);
  }

  // Default unhandled error
  const errForLogging = err instanceof Error ? err : new Error(String(err));
  appLogger.error({
    err: errForLogging,
    requestId,
    stack: errForLogging.stack,
  }, "Unhandled error");

  const status = (errForLogging as { status?: number }).status ?? 500;
  res.status(status).json(fullPayload);
};
