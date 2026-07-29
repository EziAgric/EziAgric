import { Response, Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminMiddleware } from "../middleware/admin.middleware";
import { AuthRequest } from "../services/auth.service";

function toIso(seconds: number | undefined): string | null {
  return typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null;
}

export function createAdminAuthRouter(): Router {
  const router = Router();

  // Diagnostic endpoint so admins can verify exactly which JWT claims the
  // backend parsed from their bearer token, without decoding it by hand.
  router.get(
    "/api/admin/auth/claims",
    authMiddleware,
    adminMiddleware,
    (req: AuthRequest, res: Response) => {
      const user = req.user!;
      res.status(200).json({
        walletAddress: user.walletAddress,
        tokenId: user.jti,
        issuedAt: toIso(user.iat),
        expiresAt: toIso(user.exp),
        issuer: user.iss ?? null,
        audience: user.aud ?? null,
      });
    },
  );

  return router;
}
