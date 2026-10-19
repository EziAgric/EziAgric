import express from 'express';
import request from 'supertest';
import { TradeTemplateNotFoundError } from '../../services/trade.template.service';

jest.mock('../../middleware/auth', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    if (req.headers.authorization === 'Bearer valid-token') {
      req.user = { id: 'user-1', userId: 'user-1' };
      return next();
    }
    return next();
  },
}));

const mockSaveTemplate = jest.fn();
const mockListTemplates = jest.fn();
const mockCreateFromTemplate = jest.fn();

jest.mock('../../services/trade.template.service', () => {
  const actual = jest.requireActual('../../services/trade.template.service');
  return {
    ...actual,
    tradeTemplateService: {
      saveTemplate: (...args: any[]) => mockSaveTemplate(...args),
      listTemplates: (...args: any[]) => mockListTemplates(...args),
      createFromTemplate: (...args: any[]) => mockCreateFromTemplate(...args),
    },
  };
});

import tradeTemplateRoutes from '../trade.template.routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/trade-templates', tradeTemplateRoutes);
  return app;
}

describe('trade.template.routes', () => {
  let app: express.Express;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
  });

  describe('POST /api/trade-templates (save)', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app)
        .post('/api/trade-templates')
        .send({ name: 'My Template', symbol: 'AAPL' });
      expect(res.status).toBe(401);
      expect(mockSaveTemplate).not.toHaveBeenCalled();
    });

    it('returns 400 for an invalid body', async () => {
      const res = await request(app)
        .post('/api/trade-templates')
        .set('Authorization', 'Bearer valid-token')
        .send({});
      expect(res.status).toBe(400);
      expect(mockSaveTemplate).not.toHaveBeenCalled();
    });

    it('returns 201 on the happy path', async () => {
      const template = { id: 'tpl-1', name: 'My Template', symbol: 'AAPL' };
      mockSaveTemplate.mockResolvedValue(template);

      const res = await request(app)
        .post('/api/trade-templates')
        .set('Authorization', 'Bearer valid-token')
        .send({ name: 'My Template', symbol: 'AAPL' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(template);
      expect(mockSaveTemplate).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /api/trade-templates (list)', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app).get('/api/trade-templates');
      expect(res.status).toBe(401);
      expect(mockListTemplates).not.toHaveBeenCalled();
    });

    it('returns 200 with the list on the happy path', async () => {
      const templates = [{ id: 'tpl-1', name: 'My Template', symbol: 'AAPL' }];
      mockListTemplates.mockResolvedValue(templates);

      const res = await request(app)
        .get('/api/trade-templates')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body).toEqual(templates);
      expect(mockListTemplates).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /api/trade-templates/:templateId/create (create-from-template)', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(app)
        .post('/api/trade-templates/tpl-1/create')
        .send({ quantity: 10 });
      expect(res.status).toBe(401);
      expect(mockCreateFromTemplate).not.toHaveBeenCalled();
    });

    it('returns 400 for an invalid templateId param', async () => {
      const res = await request(app)
        .post('/api/trade-templates/not-a-valid-id/create')
        .set('Authorization', 'Bearer valid-token')
        .send({ quantity: 10 });
      expect(res.status).toBe(400);
      expect(mockCreateFromTemplate).not.toHaveBeenCalled();
    });

    it('returns 400 for an invalid body', async () => {
      const res = await request(app)
        .post('/api/trade-templates/tpl-1/create')
        .set('Authorization', 'Bearer valid-token')
        .send({ quantity: 'not-a-number' });
      expect(res.status).toBe(400);
      expect(mockCreateFromTemplate).not.toHaveBeenCalled();
    });

    it('returns 404 when the template is not found', async () => {
      mockCreateFromTemplate.mockRejectedValue(
        new TradeTemplateNotFoundError('tpl-1')
      );

      const res = await request(app)
        .post('/api/trade-templates/tpl-1/create')
        .set('Authorization', 'Bearer valid-token')
        .send({ quantity: 10 });

      expect(res.status).toBe(404);
    });

    it('returns 201 on the happy path', async () => {
      const trade = { id: 'trade-1', symbol: 'AAPL', quantity: 10 };
      mockCreateFromTemplate.mockResolvedValue(trade);

      const res = await request(app)
        .post('/api/trade-templates/tpl-1/create')
        .set('Authorization', 'Bearer valid-token')
        .send({ quantity: 10 });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(trade);
      expect(mockCreateFromTemplate).toHaveBeenCalledTimes(1);
    });
  });
});
