import { Response, Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminMiddleware } from "../middleware/admin.middleware";
import { AuthRequest } from "../services/auth.service";
import { adminAuditService } from "../services/adminAudit.service";
import { createWalletRateLimiter } from "../lib/rateLimit";
import { RATE_LIMIT_CONFIG } from "../config/rateLimit";
import { CURSOR_DEPRECATION_WARNING, InvalidCursorError } from "../lib/cursorPagination";

function parseNumericQueryParam(value: unknown): number | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseStringQueryParam(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

const adminRateLimit = createWalletRateLimiter(RATE_LIMIT_CONFIG.admin);

export function createAdminAuditRouter(): Router {
  const router = Router();

  router.get(
    "/api/admin/audit",
    authMiddleware,
    adminMiddleware,
    adminRateLimit,
    async (req: AuthRequest, res: Response, next) => {
      try {
        const page = parseNumericQueryParam(req.query.page);
        const result = await adminAuditService.list({
          cursor: parseStringQueryParam(req.query.cursor),
          page,
          limit: parseNumericQueryParam(req.query.limit),
        });
        if (page !== undefined) {
          res.setHeader("Warning", CURSOR_DEPRECATION_WARNING);
        }
        res.status(200).json(result);
      } catch (error) {
        if (error instanceof InvalidCursorError) {
          res.status(400).json({ error: error.message });
          return;
        }
        next(error);
      }
    },
  );

  return router;
}
