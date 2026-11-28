import { Router, Request, Response } from 'express';
import { requireAdmin } from '../middleware/auth';
import { getTradeStats } from '../services/statsService';

const router = Router();

/**
 * GET /stats
 * Returns aggregate trade statistics for the admin dashboard.
 * Requires admin role. Results are cached in Redis with a 5-minute TTL.
 */
router.get('/', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const stats = await getTradeStats();
    res.json(stats);
  } catch (err) {
    console.error('Failed to compute trade stats:', err);
    res.status(500).json({ error: 'Failed to compute trade statistics' });
  }
});

export default router;
