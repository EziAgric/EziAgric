import { Response, Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminMiddleware } from "../middleware/admin.middleware";
import { AuthRequest, AuthService } from "../services/auth.service";
import { adminSessionService } from "../services/adminSession.service";
import { deviceContextFromRequest } from "../lib/deviceContext";
import { createWalletRateLimiter } from "../lib/rateLimit";
import { RATE_LIMIT_CONFIG } from "../config/rateLimit";
import { runtimeEnvValue } from "../config/env";

function toIso(seconds: number | undefined): string | null {
  return typeof seconds === "number"
    ? new Date(seconds * 1000).toISOString()
    : null;
}

const adminRateLimit = createWalletRateLimiter(RATE_LIMIT_CONFIG.admin);

export function createAdminAuthRouter(): Router {
  const router = Router();

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
        tier: user.tier ?? null,
        deviceBound: user.tier === "admin" && typeof user.deviceHash === "string",
      });
    },
  );

  /**
   * Step-up: mint a short-TTL admin token bound to the current device context
   * and register it in the session registry (issue #198). The presenting token
   * must already pass admin auth; its JTI is revoked so the credential rotates.
   */
  router.post(
    "/api/admin/auth/step-up",
    authMiddleware,
    adminMiddleware,
    adminRateLimit,
    async (req: AuthRequest, res: Response): Promise<void> => {
      try {
        const user = req.user!;
        const ctx = deviceContextFromRequest(req);
        const userAgent =
          typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : "";

        const { token, jti, expiresAt } = await AuthService.issueAdminToken(
          user.walletAddress,
          { ...ctx, userAgent },
        );

        // Rotate: retire the credential that was used to step up.
        if (user.jti && user.jti !== jti) {
          const prevExp = user.exp ?? Math.floor(Date.now() / 1000) + 60;
          await AuthService.revokeToken(user.jti, prevExp);
          await adminSessionService.revoke(user.jti);
        }

        res.status(200).json({
          token,
          jti,
          expiresAt: toIso(expiresAt),
          deviceBound: true,
          deviceHash: ctx.deviceHash,
          ipClass: ctx.ipClass,
        });
      } catch (error) {
        console.error("ADMIN STEP-UP ERROR:", error);
        res.status(500).json({ error: "Failed to issue device-bound admin session" });
      }
    },
  );

  /** List the caller's registered device-bound admin sessions (issue #198). */
  router.get(
    "/api/admin/sessions",
    authMiddleware,
    adminMiddleware,
    adminRateLimit,
    async (req: AuthRequest, res: Response): Promise<void> => {
      try {
        const sessions = await adminSessionService.listForWallet(req.user!.walletAddress);
        res.status(200).json({
          sessions: sessions.map((s) => ({
            jti: s.jti,
            deviceHash: s.deviceHash,
            ipClass: s.ipClass,
            userAgent: s.userAgent,
            issuedAt: toIso(s.issuedAt),
            expiresAt: toIso(s.expiresAt),
            lastSeenAt: toIso(s.lastSeenAt),
            current: s.jti === req.user!.jti,
          })),
        });
      } catch (error) {
        console.error("ADMIN SESSIONS LIST ERROR:", error);
        res.status(500).json({ error: "Failed to list admin sessions" });
      }
    },
  );

  /**
   * Revoke active admin sessions (Issue #49, extended for #198).
   * Body: `{ deviceHash }` revokes exactly the sessions for that device;
   * otherwise `{ jti }` (or the caller's own token JTI) is revoked.
   */
  router.post(
    "/api/admin/sessions/revoke",
    authMiddleware,
    adminMiddleware,
    adminRateLimit,
    async (req: AuthRequest, res: Response): Promise<void> => {
      try {
        const wallet = req.user!.walletAddress;

        if (typeof req.body?.deviceHash === "string" && req.body.deviceHash.length > 0) {
          const removed = await adminSessionService.revokeDevice(wallet, req.body.deviceHash);
          const now = Math.floor(Date.now() / 1000);
          await Promise.all(
            removed.map((s) => AuthService.revokeToken(s.jti, Math.max(s.expiresAt, now + 60))),
          );
          res.status(200).json({
            message: "Device session(s) revoked",
            deviceHash: req.body.deviceHash,
            revoked: removed.length,
            revokedAt: new Date().toISOString(),
          });
          return;
        }

        const jtiToRevoke = req.body?.jti || req.user?.jti;
        if (!jtiToRevoke || typeof jtiToRevoke !== "string") {
          res.status(400).json({ error: "Bad Request: missing jti or deviceHash to revoke" });
          return;
        }

        const expiresAt = req.user?.exp || Math.floor(Date.now() / 1000) + 86400;
        await AuthService.revokeToken(jtiToRevoke, expiresAt);
        // Best-effort registry cleanup (only relevant when binding is on); the
        // denylist above is what actually stops the token.
        if (runtimeEnvValue("ADMIN_SESSION_BINDING_ENABLED")) {
          void adminSessionService.revoke(jtiToRevoke).catch(() => undefined);
        }

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

  return router;
}
