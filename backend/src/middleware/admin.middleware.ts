import { Response, NextFunction } from "express";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { isMediatorAddress } from "../lib/accessControl";
import { AuthRequest, AuthService } from "../services/auth.service";

/**
 * Admin authentication middleware (adminAuth health guard).
 *
 * Enforces token freshness, session revocation checks, and mediator allowlist authorization.
 */
export const adminMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const walletAddress = req.user?.walletAddress?.trim();
  if (!req.user || !walletAddress || !isMediatorAddress(walletAddress)) {
    try {
      const activeSpan = trace.getActiveSpan();
      if (activeSpan && typeof activeSpan.setAttributes === "function") {
        activeSpan.setAttributes({
          "admin.attempted": true,
          "admin.verdict": "denied",
          "admin.address": walletAddress ?? "unknown",
        });
        activeSpan.setStatus({ code: SpanStatusCode.ERROR, message: "Forbidden: admin access required" });
      }
    } catch {
      // Ignore telemetry failure in mock/test
    }
    res.status(403).json({ error: "Forbidden: admin access required" });
    return;
  }

  // Token freshness check: reject expired or stale tokens
  const nowInSeconds = Math.floor(Date.now() / 1000);
  if (typeof req.user.exp === "number" && nowInSeconds >= req.user.exp) {
    res.status(401).json({ error: "Unauthorized: token expired or stale" });
    return;
  }

  // Revocation check: verify if token's jti has been invalidated
  if (req.user.jti) {
    try {
      const isRevoked = await AuthService.isTokenRevoked(req.user.jti);
      if (isRevoked) {
        res.status(401).json({ error: "Unauthorized: session has been revoked" });
        return;
      }
    } catch (err) {
      res.status(401).json({ error: "Unauthorized: session revocation check failed" });
      return;
    }
  }

  // Attach admin identity to the request context
  req.user.isAdmin = true;

  // Annotate active OpenTelemetry span
  try {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan && typeof activeSpan.setAttributes === "function") {
      activeSpan.setAttributes({
        "admin.action": "privileged",
        "admin.address": walletAddress,
        "admin.verdict": "granted",
        "is_admin": true,
      });
    }
  } catch {
    // Ignore telemetry failure in mock/test
  }

  next();
};
