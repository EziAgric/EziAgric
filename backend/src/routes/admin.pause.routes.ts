import { Response, Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminMiddleware } from '../middleware/admin.middleware';
import { validateRequest } from '../middleware/validateRequest';
import { AuthRequest } from '../services/auth.service';
import { prisma } from '../lib/db';
import { appLogger } from '../middleware/logger';

const pauseBodySchema = z.object({
  guardianAddress: z.string().min(1, 'guardianAddress is required'),
  reason: z.string().max(500).optional(),
  txHash: z.string().optional(),
});

export function createAdminPauseRouter(): Router {
  const router = Router();

  router.use(authMiddleware, adminMiddleware);

  /**
   * POST /api/admin/contract/pause
   * Record that a guardian has submitted a pause transaction on-chain.
   * Freezes trade mutations in the backend until an unpause event is received.
   */
  router.post(
    '/api/admin/contract/pause',
    validateRequest({ body: pauseBodySchema }),
    async (req: AuthRequest, res: Response) => {
      try {
        const { guardianAddress, reason, txHash } = pauseBodySchema.parse(req.body);

        await prisma.contractPauseLog.create({
          data: { paused: true, guardianAddress, reason, txHash },
        });

        appLogger.warn(
          { guardianAddress, reason, txHash },
          'Contract pause recorded — trade mutations will be rejected',
        );

        res.json({ paused: true, guardianAddress, reason });
      } catch (err) {
        appLogger.error({ err }, 'Failed to record contract pause');
        res.status(500).json({ error: 'Internal server error' });
      }
    },
  );

  /**
   * POST /api/admin/contract/unpause
   * Record that a guardian has submitted an unpause transaction on-chain.
   */
  router.post(
    '/api/admin/contract/unpause',
    validateRequest({ body: pauseBodySchema }),
    async (req: AuthRequest, res: Response) => {
      try {
        const { guardianAddress, reason, txHash } = pauseBodySchema.parse(req.body);

        await prisma.contractPauseLog.create({
          data: { paused: false, guardianAddress, reason, txHash },
        });

        appLogger.info(
          { guardianAddress, reason, txHash },
          'Contract unpause recorded — trade mutations re-enabled',
        );

        res.json({ paused: false, guardianAddress, reason });
      } catch (err) {
        appLogger.error({ err }, 'Failed to record contract unpause');
        res.status(500).json({ error: 'Internal server error' });
      }
    },
  );

  /**
   * GET /api/admin/contract/pause-status
   * Returns the latest pause state from the audit log.
   */
  router.get(
    '/api/admin/contract/pause-status',
    async (_req: AuthRequest, res: Response) => {
      try {
        const latest = await prisma.contractPauseLog.findFirst({
          orderBy: { createdAt: 'desc' },
          select: { paused: true, guardianAddress: true, reason: true, createdAt: true },
        });

        res.json({ paused: latest?.paused ?? false, lastEvent: latest ?? null });
      } catch (err) {
        appLogger.error({ err }, 'Failed to fetch pause status');
        res.status(500).json({ error: 'Internal server error' });
      }
    },
  );

  return router;
}
