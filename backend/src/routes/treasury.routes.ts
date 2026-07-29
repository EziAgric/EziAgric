import { Router } from "express";
import { TreasuryController } from "../controllers/treasury.controller";
import { TreasuryService } from "../services/treasury.service";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminMiddleware } from "../middleware/admin.middleware";
import { validateRequest } from "../middleware/validateRequest";
import { treasuryWithdrawSchema } from "../schemas/treasury.schemas";
import { createAdminQuotaMiddleware } from "../middleware/adminQuota.middleware";
import { ADMIN_QUOTA_CONFIG } from "../config/adminQuota";

export function createTreasuryRouter(): Router {
  const router = Router();
  const treasuryService = new TreasuryService();
  const treasuryController = new TreasuryController(treasuryService);

  router.get("/balance", authMiddleware, treasuryController.getBalance);
  router.post(
    "/withdraw",
    authMiddleware,
    adminMiddleware,
    validateRequest({ body: treasuryWithdrawSchema }),
    createAdminQuotaMiddleware("treasury.withdraw", ADMIN_QUOTA_CONFIG.treasuryWithdraw),
    treasuryController.withdraw,
  );
  router.get("/config", authMiddleware, treasuryController.getConfig);

  return router;
}

export const treasuryRoutes = createTreasuryRouter();
