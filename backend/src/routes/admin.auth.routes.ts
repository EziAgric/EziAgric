import { Response, Router } from "express";
import { StrKey } from "@stellar/stellar-sdk";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminMiddleware } from "../middleware/admin.middleware";
import { AuthRequest, AuthService } from "../services/auth.service";
import { createWalletRateLimiter } from "../lib/rateLimit";
import { RATE_LIMIT_CONFIG } from "../config/rateLimit";
import { prisma } from "../lib/db";
import { csrfToken } from "../middleware/csrf.middleware";

function toIso(seconds: number | undefined): string | null {
  return typeof seconds === "number"
    ? new Date(seconds * 1000).toISOString()
    : null;
}

const adminRateLimit = createWalletRateLimiter(RATE_LIMIT_CONFIG.admin);

export function createAdminAuthRouter(): Router {
  const router = Router();

  router.get("/api/admin/csrf-token", authMiddleware, adminMiddleware, csrfToken);

  // Diagnostic endpoint so admins can verify exactly which JWT claims the
  // backend parsed from their bearer token, without decoding it by hand.
  router.get(
    "/api/admin/auth/claims",
    authMiddleware,
    adminMiddleware,
    adminRateLimit,
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

  /**
   * Control plane API endpoint to revoke active admin sessions (Issue #49).
   * Accepts optional `jti` in body (or revokes the caller's active token JTI).
   */
  router.post(
    "/api/admin/sessions/revoke",
    authMiddleware,
    adminMiddleware,
    adminRateLimit,
    async (req: AuthRequest, res: Response): Promise<void> => {
      try {
        const jtiToRevoke = req.body?.jti || req.user?.jti;
        if (!jtiToRevoke || typeof jtiToRevoke !== "string") {
          res.status(400).json({ error: "Bad Request: missing jti to revoke" });
          return;
        }

        const expiresAt = req.user?.exp || Math.floor(Date.now() / 1000) + 86400;
        await AuthService.revokeToken(jtiToRevoke, expiresAt);

        res.status(200).json({
          message: "Session revoked successfully",
          jti: jtiToRevoke,
          revokedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error("REVOKE HANDLER ERROR:", error);
        res.status(500).json({ error: "Failed to revoke admin session" });
      }
    },
  );

  /**
   * Bulk-revoke every outstanding JWT for a wallet by bumping its token
   * generation (Issue #213). Unlike /api/admin/sessions/revoke (single jti),
   * this invalidates all sessions immediately regardless of individual
   * expiry — for use on role/status/lock changes or incident response.
   */
  router.post(
    "/api/admin/sessions/revoke-all",
    authMiddleware,
    adminMiddleware,
    adminRateLimit,
    async (req: AuthRequest, res: Response): Promise<void> => {
      try {
        const walletAddress = req.body?.walletAddress;
        if (typeof walletAddress !== "string" || !StrKey.isValidEd25519PublicKey(walletAddress)) {
          res.status(400).json({ error: "Bad Request: walletAddress must be a valid Stellar public key" });
          return;
        }

        const tokenVersion = await AuthService.bumpTokenVersion(walletAddress);
        await prisma.adminActionAudit.create({
          data: {
            action: "REVOKE_ALL_SESSIONS",
            actorAddress: req.user!.walletAddress,
            targetReference: walletAddress.toLowerCase(),
            note: req.body?.reason && typeof req.body.reason === "string" ? req.body.reason : null,
          },
        });

        res.status(200).json({
          message: "All sessions revoked successfully",
          walletAddress: walletAddress.toLowerCase(),
          tokenVersion,
          revokedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error("REVOKE ALL HANDLER ERROR:", error);
        res.status(500).json({ error: "Failed to revoke sessions" });
      }
    },
  );

  return router;
}
