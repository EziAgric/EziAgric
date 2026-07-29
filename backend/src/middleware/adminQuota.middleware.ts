import { NextFunction, Response } from "express";
import { AdminQuotaPreset } from "../config/adminQuota";
import { ErrorCode } from "../errors/errorCodes";
import { AuthRequest } from "../services/auth.service";

interface QuotaWindow {
  count: number;
  resetAt: number;
}

// In-memory fixed-window counters, keyed by "operation:identity". A single
// process is fine for this deployment's admin surface; if the API scales
// horizontally this store should move to a shared cache (e.g. Redis).
const quotaStore = new Map<string, QuotaWindow>();

function resolveAdminIdentity(req: AuthRequest): string {
  const apiKey = req.headers["x-api-key"];
  if (typeof apiKey === "string" && apiKey.trim()) {
    return `apikey:${apiKey.trim()}`;
  }
  const walletAddress = req.user?.walletAddress?.trim();
  return walletAddress ? `wallet:${walletAddress}` : "unknown";
}

export function createAdminQuotaMiddleware(operation: string, preset: AdminQuotaPreset) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const key = `${operation}:${resolveAdminIdentity(req)}`;
    const now = Date.now();

    let window = quotaStore.get(key);
    if (!window || window.resetAt <= now) {
      window = { count: 0, resetAt: now + preset.windowMs };
      quotaStore.set(key, window);
    }

    window.count += 1;

    if (window.count > preset.max) {
      const retryAfterSeconds = Math.max(0, Math.ceil((window.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        code: ErrorCode.ADMIN_QUOTA_EXCEEDED,
        message: preset.message,
        details: {
          operation,
          limit: preset.max,
          windowMs: preset.windowMs,
          retryAfterSeconds,
        },
        timestamp: new Date().toISOString(),
        path: req.path,
      });
      return;
    }

    next();
  };
}

/** Test-only: clears all in-memory quota counters and windows. */
export function resetAdminQuotas(): void {
  quotaStore.clear();
}
