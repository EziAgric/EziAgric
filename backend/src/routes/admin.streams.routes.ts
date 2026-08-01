import { Response, Router } from "express";
import { StreamStatus } from "@prisma/client";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminMiddleware } from "../middleware/admin.middleware";
import { validateRequest } from "../middleware/validateRequest";
import { AuthRequest } from "../services/auth.service";
import { createWalletRateLimiter } from "../lib/rateLimit";
import { RATE_LIMIT_CONFIG } from "../config/rateLimit";
import { streamClawbackService } from "../services/streamClawback.service";
import { AppError, ErrorCode } from "../errors/errorCodes";
import { classifyAdminSubmissionError } from "../errors/adminSubmissionError";
import { adminNotificationService, extractErrorInfo } from "../services/adminNotification.service";
import {
  StreamTerminationService,
  streamTerminationService,
  ADMIN_ACTION_STREAM_TERMINATE,
} from "../services/streamTermination.service";
import { AdminStreamsService, adminStreamsService } from "../services/adminStreams.service";
import {
  getCachedStreamState,
} from "../services/streamCache.service";
import {
  StreamLockService,
  streamLockService,
} from "../services/streamLock.service";

const streamIdParamSchema = z.object({
  id: z
    .string()
    .min(1, "Stream ID is required")
    .max(128, "Stream ID must be at most 128 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Stream ID must contain only alphanumeric characters, hyphens, or underscores"),
});

const streamListQuerySchema = z.object({
  page: z.preprocess((val) => (val === undefined ? undefined : Number(val)), z.number().int().min(1).default(1)),
  limit: z.preprocess(
    (val) => (val === undefined ? undefined : Number(val)),
    z.number().int().min(1).max(100).default(20),
  ),
  status: z.nativeEnum(StreamStatus).optional(),
  vestingState: z.enum(["not_started", "vesting", "fully_vested"]).optional(),
  adminTag: z.string().min(1).max(100).optional(),
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
 * @param lockService injected so tests can exercise the route without a database.
 * @param streamsService injected so tests can exercise the route without a database.
 */
export function createAdminStreamsRouter(
  terminationService: StreamTerminationService = streamTerminationService,
  lockService: StreamLockService = streamLockService,
  streamsService: AdminStreamsService = adminStreamsService,
) {
  const router = Router();

  /**
   * GET /api/admin/streams
   * List streams an admin can act on, paged and filterable by lifecycle
   * status, derived vesting state, and admin tag (#51).
   */
  router.get(
    "/admin/streams",
    authMiddleware,
    adminMiddleware,
    adminRateLimit,
    validateRequest({ query: streamListQuerySchema }),
    async (req: AuthRequest, res: Response, next) => {
      try {
        const { page, limit, status, vestingState, adminTag } = req.query as unknown as z.infer<
          typeof streamListQuerySchema
        >;

        const result = await streamsService.list({ page, limit, status, vestingState, adminTag });
        res.status(200).json(result);
      } catch (error) {
        next(error);
      }
    },
  );

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
    validateRequest({ params: streamIdParamSchema }),
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
   * Preview the effect of a clawback before execution. Validates the
   * requested amount against the stream's actual remaining vested
   * (unclaimed) balance so the frontend confirmation flow (#56, #57) always
   * reflects real data instead of the amount alone.
   *
   * Error code references: `NOT_FOUND`, `CLAWBACK_INVALID_AMOUNT`,
   * `CLAWBACK_TOO_LARGE`.
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

        const stream = await streamsService.getByStreamId(streamId);
        if (!stream) {
          throw new AppError(ErrorCode.NOT_FOUND, `Stream ${streamId} not found`, 404, {
            streamId,
          });
        }

        const requestedClawback = BigInt(amount);
        if (requestedClawback <= BigInt(0)) {
          throw new AppError(
            ErrorCode.CLAWBACK_INVALID_AMOUNT,
            "Clawback amount must be a positive integer",
            400,
            { streamId, amount },
          );
        }

        const remainingVested = BigInt(stream.unclaimed);
        if (requestedClawback > remainingVested) {
          throw new AppError(
            ErrorCode.CLAWBACK_TOO_LARGE,
            `Requested clawback ${amount} exceeds remaining vested amount ${stream.unclaimed}`,
            400,
            { streamId, amount, remainingVested: stream.unclaimed },
          );
        }

        const postClawbackBalance = String(remainingVested - requestedClawback);

        res.status(200).json({
          streamId,
          remainingVested: stream.unclaimed,
          requestedClawback: amount,
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
        const { id } = req.params as { id: string };
        if (error instanceof AppError && error.statusCode === 404) {
          adminNotificationService.notifyOperationFailed({
            streamId: id,
            adminAddress: req.user!.walletAddress,
            action: ADMIN_ACTION_STREAM_TERMINATE,
            error: extractErrorInfo(error),
            timestamp: new Date().toISOString(),
          });
        }
        const hasUnsignedTx = !!(req.body as { unsignedTxXdr?: string })?.unsignedTxXdr;
        if (hasUnsignedTx && !(error instanceof AppError && (error.statusCode === 404 || error.statusCode === 409))) {
          next(classifyAdminSubmissionError(error, "stream_terminate"));
        } else {
          next(error);
        }
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
