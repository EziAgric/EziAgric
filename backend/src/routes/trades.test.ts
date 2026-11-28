import request from 'supertest';
import express from 'express';
import tradesRouter from './trades';

describe('POST /trades idempotency', () => {
  const app = express();
  app.use(express.json());
  app.use(tradesRouter);

  it('returns 409 with existingTradeId on duplicate submission', async () => {
    const key = `dup-${Date.now()}`;
    const payload = { symbol: 'BTCUSD', side: 'buy', quantity: 1 };

    const first = await request(app)
      .post('/trades')
      .set('X-Idempotency-Key', key)
      .send(payload);

    expect(first.status).toBe(201);
    const existingTradeId = first.body.id;

    const second = await request(app)
      .post('/trades')
      .set('X-Idempotency-Key', key)
      .send(payload);

    expect(second.status).toBe(409);
    expect(second.body).toEqual({ existingTradeId });
  });
});
