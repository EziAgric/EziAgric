import express from 'express';
import request from 'supertest';
import {
  DisputeEvidenceTradeNotFoundError,
  DisputeEvidenceAccessDeniedError,
  TradeNotDisputedError,
} from '../../services/trade.evidence.service';
import tradeEvidenceRoutes from '../trade.evidence.routes';

jest.mock('../../services/trade.evidence.service', () => {
  const actual = jest.requireActual('../../services/trade.evidence.service');
  return {
    ...actual,
    listTradeEvidence: jest.fn(),
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listTradeEvidence } = require('../../services/trade.evidence.service');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).user = { id: 'user-1', role: 'buyer' };
    next();
  });
  app.use('/trades', tradeEvidenceRoutes);
  return app;
}

describe('trade.evidence.routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  describe('GET /trades/:tradeId/evidence', () => {
    it('returns a paginated evidence list on the happy path', async () => {
      const payload = {
        items: [
          { id: 'ev-1', tradeId: 'trade-1', description: 'photo', createdAt: '2024-01-01T00:00:00.000Z' },
        ],
        page: 1,
        pageSize: 10,
        total: 1,
        totalPages: 1,
      };
      listTradeEvidence.mockResolvedValue(payload);

      const res = await request(app)
        .get('/trades/trade-1/evidence')
        .query({ page: '1', pageSize: '10' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(payload);
      expect(listTradeEvidence).toHaveBeenCalledTimes(1);
    });

    it('maps DisputeEvidenceTradeNotFoundError to 404', async () => {
      listTradeEvidence.mockRejectedValue(new DisputeEvidenceTradeNotFoundError('trade-1'));

      const res = await request(app).get('/trades/trade-1/evidence');

      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({ error: expect.any(String) });
    });

    it('maps DisputeEvidenceAccessDeniedError to 403', async () => {
      listTradeEvidence.mockRejectedValue(new DisputeEvidenceAccessDeniedError('trade-1'));

      const res = await request(app).get('/trades/trade-1/evidence');

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ error: expect.any(String) });
    });

    it('maps TradeNotDisputedError to 409', async () => {
      listTradeEvidence.mockRejectedValue(new TradeNotDisputedError('trade-1'));

      const res = await request(app).get('/trades/trade-1/evidence');

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ error: expect.any(String) });
    });
  });
});
