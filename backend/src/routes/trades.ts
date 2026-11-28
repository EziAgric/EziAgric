import { Router, Request, Response } from 'express';
import { tradeService } from '../services/tradeService';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createTradeSchema, updateTradeSchema } from '../schemas/tradeSchemas';
import { logger } from '../utils/logger';
import { buildPriceWarning } from '../services/priceFeedService';

const router = Router();

/**
 * GET /trades/:id/timeline
 * Returns a chronological timeline of trade state changes.
 */
router.get('/:id/timeline', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const timeline = await tradeService.getTradeTimeline(id);

    if (!timeline) {
      return res.status(404).json({ error: 'Trade not found' });
    }

    return res.json(timeline);
  } catch (error) {
    logger.error('Failed to fetch trade timeline', { error, tradeId: req.params.id });
    return res.status(500).json({ error: 'Failed to fetch trade timeline' });
  }
});

/**
 * GET /trades/:id
 * Returns a single trade by ID.
 */
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const trade = await tradeService.getTradeById(req.params.id);

    if (!trade) {
      return res.status(404).json({ error: 'Trade not found' });
    }

    return res.json(trade);
  } catch (error) {
    logger.error('Failed to fetch trade', { error, tradeId: req.params.id });
    return res.status(500).json({ error: 'Failed to fetch trade' });
  }
});

/**
 * GET /trades
 * Returns a list of trades for the authenticated user.
 */
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const trades = await tradeService.listTrades(req.user!.id);
    return res.json(trades);
  } catch (error) {
    logger.error('Failed to list trades', { error });
    return res.status(500).json({ error: 'Failed to list trades' });
  }
});

/**
 * POST /trades
 * Creates a new trade.
 */
router.post('/', authenticate, validate(createTradeSchema), async (req: Request, res: Response) => {
  try {
    const trade = await tradeService.createTrade(req.user!.id, req.body);

    // Informational only — never blocks trade creation.
    const { commodity, quantity, price } = req.body ?? {};
    let priceWarning: Awaited<ReturnType<typeof buildPriceWarning>> = null;
    if (commodity && quantity && price) {
      priceWarning = await buildPriceWarning(commodity, Number(price) / Number(quantity));
    }

    return res.status(201).json({
      trade,
      ...(priceWarning ? { priceWarning } : {}),
    });
  } catch (error) {
    logger.error('Failed to create trade', { error });
    return res.status(500).json({ error: 'Failed to create trade' });
  }
});

/**
 * PATCH /trades/:id
 * Updates an existing trade.
 */
router.patch('/:id', authenticate, validate(updateTradeSchema), async (req: Request, res: Response) => {
  try {
    const trade = await tradeService.updateTrade(req.params.id, req.user!.id, req.body);

    if (!trade) {
      return res.status(404).json({ error: 'Trade not found' });
    }

    return res.json(trade);
  } catch (error) {
    logger.error('Failed to update trade', { error, tradeId: req.params.id });
    return res.status(500).json({ error: 'Failed to update trade' });
  }
});

export default router;