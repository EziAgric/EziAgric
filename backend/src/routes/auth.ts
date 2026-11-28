/**
 * Auth Routes
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { AuthError, rotateRefreshToken } from "../services/authService";
import { appLogger } from "../middleware/logger";

const refreshSchema = z.object({ refreshToken: z.string().min(1) });

export function createAuthRoutes(): Router {
  const router = Router();

  /**
   * POST /auth/refresh
   * Rotate a refresh token: returns a new access + refresh token pair.
   */
  router.post("/refresh", async (req: Request, res: Response) => {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "refreshToken is required" });
    }
    try {
      const tokens = await rotateRefreshToken(parsed.data.refreshToken);
      return res.json(tokens);
    } catch (error) {
      if (error instanceof AuthError) {
        return res.status(401).json({ error: error.message });
      }
      appLogger.error({ err: error }, "Refresh token rotation failed");
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  return router;
}
