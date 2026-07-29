import { NextFunction, Response } from "express";
import { ErrorCode } from "../errors/errorCodes";
import { AuthRequest } from "../services/auth.service";
import { env } from "../config/env";

/**
 * Guards admin routes that build Soroban transactions (RPC calls that can
 * hang) with a hard wall-clock timeout, responding 504 if the handler
 * hasn't sent a response in time. Route handlers must still check
 * `res.headersSent` before writing their own response, since the
 * in-flight RPC call isn't cancelled - only the client response is.
 */
export function adminTimeoutMiddleware(timeoutMs: number = env.ADMIN_ROUTE_TIMEOUT_MS) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(504).json({
          code: ErrorCode.ADMIN_OPERATION_TIMEOUT,
          error: "Admin operation timed out",
        });
      }
    }, timeoutMs);
    timer.unref?.();

    res.once("finish", () => clearTimeout(timer));
    res.once("close", () => clearTimeout(timer));
    next();
  };
}
