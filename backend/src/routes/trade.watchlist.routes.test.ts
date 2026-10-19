import express from 'express';
import request from 'supertest';
import { tradeWatchlistRouter } from './trade.watchlist.routes';
import {
  WatchTradeNotFoundError,
  WatchTradeAccessDeniedError,
} from '../services/trade.watchlist.service';

jest.mock('../services/trade.watchlist.service', () => {
  const actual = jest.requireActual('../services/trade.watchlist.service');
  return {
    ...actual,
    watchTrade: jest.fn(),
    unwatchTrade: jest.fn(),
    listWatchedTrades: jest.fn(),
  };
});

import {
  watchTrade,
  unwatchTrade,
  listWatchedTrades,
  WatchTradeNotFoundError as MockNotFoundError,
  WatchTradeAccessDeniedError as MockAccessDeniedError,
} from '../services/trade.watchlist.service';

const mockedWatchTrade = watchTrade as jest.Mock;
const mockedUnwatchTrade = unwatchTrade as jest.Mock;
const mockedListWatchedTrades = listWatchedTrades as jest.Mock;

function buildApp(options: { authenticated?: boolean } = {}) {
  const { authenticated = true } = options;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (authenticated) {
      (req as any).user = { id: 'user-1' };
    }
    next();
  });
  app.use('/trades', tradeWatchlistRouter);
  return app;
}

describe('trade.watchlist.routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /trades/:id/watch', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(buildApp({ authenticated: false }))
        .post('/trades/trade-1/watch')
        .send({});

      expect(res.status).toBe(401);
      expect(mockedWatchTrade).not.toHaveBeenCalled();
    });

    it('returns 404 when WatchTradeNotFoundError is thrown', async () => {
      mockedWatchTrade.mockRejectedValueOnce(
        new MockNotFoundError('trade not found'),
      );

      const res = await request(buildApp())
        .post('/trades/trade-1/watch')
        .send({});

      expect(res.status).toBe(404);
    });

    it('returns 403 when WatchTradeAccessDeniedError is thrown', async () => {
      mockedWatchTrade.mockRejectedValueOnce(
        new MockAccessDeniedError('access denied'),
      );

      const res = await request(buildApp())
        .post('/trades/trade-1/watch')
        .send({});

      expect(res.status).toBe(403);
    });

    it('returns success when watch succeeds', async () => {
      mockedWatchTrade.mockResolvedValueOnce({ id: 'watch-1' });

      const res = await request(buildApp())
        .post('/trades/trade-1/watch')
        .send({});

      expect(res.status).toBeLessThan(400);
      expect(mockedWatchTrade).toHaveBeenCalledTimes(1);
    });
  });

  describe('DELETE /trades/:id/watch', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(buildApp({ authenticated: false }))
        .delete('/trades/trade-1/watch');

      expect(res.status).toBe(401);
      expect(mockedUnwatchTrade).not.toHaveBeenCalled();
    });

    it('returns 404 when WatchTradeNotFoundError is thrown', async () => {
      mockedUnwatchTrade.mockRejectedValueOnce(
        new MockNotFoundError('trade not found'),
      );

      const res = await request(buildApp()).delete('/trades/trade-1/watch');

      expect(res.status).toBe(404);
    });

    it('returns 403 when WatchTradeAccessDeniedError is thrown', async () => {
      mockedUnwatchTrade.mockRejectedValueOnce(
        new MockAccessDeniedError('access denied'),
      );

      const res = await request(buildApp()).delete('/trades/trade-1/watch');

      expect(res.status).toBe(403);
    });

    it('returns success when unwatch succeeds', async () => {
      mockedUnwatchTrade.mockResolvedValueOnce(undefined);

      const res = await request(buildApp()).delete('/trades/trade-1/watch');

      expect(res.status).toBeLessThan(400);
      expect(mockedUnwatchTrade).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /trades/watched', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await request(buildApp({ authenticated: false })).get(
        '/trades/watched',
      );

      expect(res.status).toBe(401);
      expect(mockedListWatchedTrades).not.toHaveBeenCalled();
    });

    it('returns the watched trades list', async () => {
      mockedListWatchedTrades.mockResolvedValueOnce([
        { id: 'trade-1' },
        { id: 'trade-2' },
      ]);

      const res = await request(buildApp()).get('/trades/watched');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ id: 'trade-1' }, { id: 'trade-2' }]);
      expect(mockedListWatchedTrades).toHaveBeenCalledTimes(1);
    });
  });
});
