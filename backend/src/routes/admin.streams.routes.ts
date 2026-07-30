import { Response, Router } from "express";
import { StreamStatus } from "@prisma/client";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminMiddleware } from "../middleware/admin.middleware";
import { validateRequest } from "../middleware/validateRequest";
import { AuthRequest } from "../services/auth.service";
import { createWalletRateLimiter } from "../lib/rateLimit";
import { RATE_LIMIT_CONFIG } from "../config/rateLimit";
import { AppError, ErrorCode } from "../errors/errorCodes";
import {
  StreamTerminationService,
  streamTerminationService,
} from "../services/streamTermination.service";
import { AdminStreamsService, adminStreamsService } from "../services/adminStreams.service";

const streamIdParamSchema = z.object({
  id: z.string().min(1, "Stream ID is required"),
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

const terminateBodySchema = z.object({
  reason: z.string().min(1).max(500).optional(),
  unsignedTxXdr: z.string().min(1).optional(),
});

const adminRateLimit = createWalletRateLimiter(RATE_LIMIT_CONFIG.admin);

/**
 * @param terminationService injected so tests can exercise the route without a
 * database or an admin signing key.
 * @param streamsService injected so tests can exercise the route without a database.
 */
export function createAdminStreamsRouter(
  terminationService: StreamTerminationService = streamTerminationService,
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
      try {
        const { id: streamId } = req.params as { id: string };
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
        next(error);
      }
    },
  );

  return router;
}
