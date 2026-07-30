import { Response, Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminMiddleware } from "../middleware/admin.middleware";
import { validateRequest } from "../middleware/validateRequest";
import { AuthRequest } from "../services/auth.service";
import { createWalletRateLimiter } from "../lib/rateLimit";
import { RATE_LIMIT_CONFIG } from "../config/rateLimit";
import { streamClawbackService } from "../services/streamClawback.service";
import { AppError, ErrorCode } from "../errors/errorCodes";
import { adminNotificationService, extractErrorInfo } from "../services/adminNotification.service";
import {
  StreamTerminationService,
  streamTerminationService,
  ADMIN_ACTION_STREAM_TERMINATE,
} from "../services/streamTermination.service";
import {
  getCachedStreamState,
} from "../services/streamCache.service";
import {
  StreamLockService,
  streamLockService,
} from "../services/streamLock.service";

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

const lockBodySchema = z.object({
  reason: z.string().min(1).max(500).optional(),
});

const unlockBodySchema = z.object({
  reason: z.string().min(1).max(500).optional(),
});

const terminateBodySchema = z.object({
  reason: z.string().min(1).max(500).optional(),
  unsignedTxXdr: z.string().min(1).optional(),
});

const adminRateLimit = createWalletRateLimiter(RATE_LIMIT_CONFIG.admin);

/**
 * @param terminationService injected so tests can exercise the route without a
 * database or an admin signing key.
 */
export function createAdminStreamsRouter(
  terminationService: StreamTerminationService = streamTerminationService,
  lockService: StreamLockService = streamLockService,
) {
  const router = Router();

  /**
   * GET /api/admin/streams/:id
   * Retrieve cached stream state for admin queries.
   * Returns cached result when fresh, otherwise fetches from DB and caches it.
   */
  router.get(
    "/admin/streams/:id",
    authMiddleware,
    adminMiddleware,
    adminRateLimit,
    async (req: AuthRequest, res: Response, next) => {
      try {
        const { id: streamId } = req.params as { id: string };
        const state = await getCachedStreamState(streamId);

        if (!state) {
          res.status(404).json({ error: "Stream not found" });
          return;
        }

        res.status(200).json(state);
      } catch (error) {
        next(error);
      }
    },
  );

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
      const { id: streamId } = req.params as { id: string };
      try {
        streamClawbackService.acquire(streamId);
      } catch (error) {
        return next(error);
      }

      try {
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
      } finally {
        streamClawbackService.release(streamId);
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

        await lockService.requireStreamNotLocked(streamId);

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

        await lockService.requireStreamNotLocked(streamId);

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

  /**
   * POST /api/admin/streams/:id/terminate
   * Terminate a stream permanently. Admin only.
   *
   * The stream's state is validated before anything is signed or written:
   * unknown stream → 404, already-terminal stream → 409. Supplying
   * `unsignedTxXdr` signs the on-chain terminate call with the admin key and
   * returns it for submission; omitting it performs the backend transition
   * only. Every termination writes an AdminActionAudit record.
   */
  router.post(
    "/admin/streams/:id/terminate",
    authMiddleware,
    adminMiddleware,
    adminRateLimit,
    validateRequest({ params: streamIdParamSchema, body: terminateBodySchema }),
    async (req: AuthRequest, res: Response, next) => {
      try {
        const { id: streamId } = req.params as { id: string };
        const { reason, unsignedTxXdr } = req.body as {
          reason?: string;
          unsignedTxXdr?: string;
        };
        const adminAddress = req.user!.walletAddress;

        await lockService.requireStreamNotLocked(streamId);

        const result = await terminationService.terminate({
          streamId,
          adminAddress,
          reason,
          unsignedTxXdr,
        });

        res.status(200).json({
          ...result,
          reversible: false,
        });
      } catch (error) {
        if (error instanceof AppError && error.statusCode === 404) {
          const { id } = req.params as { id: string };
          adminNotificationService.notifyOperationFailed({
            streamId: id,
            adminAddress: req.user!.walletAddress,
            action: ADMIN_ACTION_STREAM_TERMINATE,
            error: extractErrorInfo(error),
            timestamp: new Date().toISOString(),
          });
        }
        next(error);
      }
    },
  );

  /**
   * POST /api/admin/streams/:id/lock
   * Lock a stream for maintenance. Idempotent — relocking an already-locked
   * stream returns 200. Locked streams reject other admin mutations (suspend,
   * resume, terminate, clawback) with 409 until unlocked.
   */
  router.post(
    "/admin/streams/:id/lock",
    authMiddleware,
    adminMiddleware,
    adminRateLimit,
    validateRequest({ params: streamIdParamSchema, body: lockBodySchema }),
    async (req: AuthRequest, res: Response, next) => {
      try {
        const { id: streamId } = req.params as { id: string };
        const { reason } = req.body as { reason?: string };
        const adminAddress = req.user!.walletAddress;

        const result = await lockService.lock({
          streamId,
          adminAddress,
          reason,
        });

        res.status(200).json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * POST /api/admin/streams/:id/unlock
   * Unlock a previously locked stream. Idempotent — unlocking an already-
   * unlocked stream returns 200.
   */
  router.post(
    "/admin/streams/:id/unlock",
    authMiddleware,
    adminMiddleware,
    adminRateLimit,
    validateRequest({ params: streamIdParamSchema, body: unlockBodySchema }),
    async (req: AuthRequest, res: Response, next) => {
      try {
        const { id: streamId } = req.params as { id: string };
        const { reason } = req.body as { reason?: string };
        const adminAddress = req.user!.walletAddress;

        const result = await lockService.unlock({
          streamId,
          adminAddress,
          reason,
        });

        res.status(200).json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
