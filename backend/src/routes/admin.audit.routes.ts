import { Response, Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminMiddleware } from "../middleware/admin.middleware";
import { AuthRequest } from "../services/auth.service";
import { adminAuditService } from "../services/adminAudit.service";

function parseNumericQueryParam(value: unknown): number | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function createAdminAuditRouter(): Router {
  const router = Router();

  router.get(
    "/admin/audit",
    authMiddleware,
    adminMiddleware,
    async (req: AuthRequest, res: Response, next) => {
      try {
        const result = await adminAuditService.list({
          page: parseNumericQueryParam(req.query.page),
          limit: parseNumericQueryParam(req.query.limit),
        });
        res.status(200).json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
