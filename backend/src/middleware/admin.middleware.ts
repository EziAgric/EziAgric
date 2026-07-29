import { Response, NextFunction } from "express";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { isMediatorAddress } from "../lib/accessControl";
import { AuthRequest } from "../services/auth.service";

export const adminMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const walletAddress = req.user?.walletAddress?.trim();
  if (!walletAddress || !isMediatorAddress(walletAddress)) {
    // Record the failed admin access attempt on the active span
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.setAttributes({
        "admin.attempted": true,
        "admin.verdict": "denied",
        "admin.address": walletAddress ?? "unknown",
      });
      activeSpan.setStatus({ code: SpanStatusCode.ERROR, message: "Forbidden: admin access required" });
    }
    res.status(403).json({ error: "Forbidden: admin access required" });
    return;
  }

  // Attach admin identity to the request context so downstream handlers
  // and audit logs can record which admin invoked a privileged action.
  if (req.user) {
    req.user.isAdmin = true;
  }

  // Annotate the active OpenTelemetry span with admin identity so
  // observability systems can filter and alert on admin actions.
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {      activeSpan.setAttributes({
      "admin.action": "privileged",
      "admin.address": walletAddress,
      "admin.verdict": "granted",
      "is_admin": true,
    });
  }

  next();
};
