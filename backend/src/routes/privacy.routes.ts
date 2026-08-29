import { Response, Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminMiddleware } from "../middleware/admin.middleware";
import { AuthRequest } from "../services/auth.service";
import { eraseUserData, exportUserData } from "../services/privacy.service";

function caller(req: AuthRequest): string | undefined {
  return req.user?.walletAddress;
}

export function createPrivacyRouter() {
  const router = Router();

  router.get("/users/me/export", authMiddleware, async (req: AuthRequest, res: Response, next) => {
    try {
      const address = caller(req);
      if (!address) return res.status(401).json({ error: "Unauthorized" });
      res.json(await exportUserData(address));
    } catch (error) {
      next(error);
    }
  });

  router.delete("/users/me", authMiddleware, async (req: AuthRequest, res: Response, next) => {
    try {
      const address = caller(req);
      if (!address) return res.status(401).json({ error: "Unauthorized" });
      res.json(await eraseUserData(address));
    } catch (error) {
      next(error);
    }
  });

  router.get("/admin/privacy/users/:walletAddress/export", authMiddleware, adminMiddleware, async (req, res, next) => {
    try {
      res.json(await exportUserData(req.params.walletAddress as string));
    } catch (error) {
      next(error);
    }
  });

  router.delete("/admin/privacy/users/:walletAddress", authMiddleware, adminMiddleware, async (req, res, next) => {
    try {
      res.json(await eraseUserData(req.params.walletAddress as string));
    } catch (error) {
      next(error);
    }
  });

  return router;
}