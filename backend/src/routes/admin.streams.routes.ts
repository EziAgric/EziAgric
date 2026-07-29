import { Response, Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminMiddleware } from "../middleware/admin.middleware";
import { validateRequest } from "../middleware/validateRequest";
import { AuthRequest } from "../services/auth.service";
import { createWalletRateLimiter } from "../lib/rateLimit";
import { RATE_LIMIT_CONFIG } from "../config/rateLimit";

const streamIdParamSchema = z.object({
  id: z.string().min(1, "Stream ID is required"),
});

const clawbackPreviewBodySchema = z.object({
  amount: z.string().regex(/^\d+$/, "Amount must be a positive integer string"),
});

const suspendBodySchema = z.object({
  reason: z.string().min(1).max(500).optional(),
});

const resumeBodySchema = z.object({
  note: z.string().min(1).max(500).optional(),
});

const adminRateLimit = createWalletRateLimiter(RATE_LIMIT_CONFIG.admin);

export function createAdminStreamsRouter() {
  const router = Router();

  /**
   * POST /api/admin/streams/:id/clawback/preview
   * Preview the effect of a clawback before execution
   */
  router.post(
    "/admin/streams/:id/clawback/preview",
    authMiddleware,
    adminMiddleware,
    adminRateLimit,
    validateRequest({
      params: streamIdParamSchema,
      body: clawbackPreviewBodySchema,
    }),
    async (req: AuthRequest, res: Response, next) => {
      try {
        const { id: streamId } = req.params as { id: string };
        const { amount } = req.body as { amount: string };

        // Mock implementation - replace with actual stream service logic
        const remainingVested = "10000";
        const requestedClawback = amount;
        const postClawbackBalance = String(
          BigInt(remainingVested) - BigInt(amount),
        );

        res.status(200).json({
          streamId,
          remainingVested,
          requestedClawback,
          postClawbackBalance,
          preview: true,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * POST /api/admin/streams/:id/suspend
   * Suspend a stream without immediate clawback
   */
  router.post(
    "/admin/streams/:id/suspend",
    authMiddleware,
    adminMiddleware,
    adminRateLimit,
    validateRequest({ params: streamIdParamSchema, body: suspendBodySchema }),
    async (req: AuthRequest, res: Response, next) => {
      try {
        const { id: streamId } = req.params as { id: string };
        const { reason } = req.body as { reason?: string };
        const adminAddress = req.user!.walletAddress;

        // Mock implementation - replace with actual stream service logic
        // This should mark the stream as suspended in the database
        res.status(200).json({
          streamId,
          status: "suspended",
          suspendedBy: adminAddress,
          suspendedAt: new Date().toISOString(),
          reason: reason || "Admin suspension",
          reversible: true,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * POST /api/admin/streams/:id/resume
   * Resume a previously suspended stream
   */
  router.post(
    "/admin/streams/:id/resume",
    authMiddleware,
    adminMiddleware,
    adminRateLimit,
    validateRequest({ params: streamIdParamSchema, body: resumeBodySchema }),
    async (req: AuthRequest, res: Response, next) => {
      try {
        const { id: streamId } = req.params as { id: string };
        const { note } = req.body as { note?: string };
        const adminAddress = req.user!.walletAddress;

        // Mock implementation - replace with actual stream service logic
        res.status(200).json({
          streamId,
          status: "active",
          resumedBy: adminAddress,
          resumedAt: new Date().toISOString(),
          note: note || "Stream resumed",
        });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
