import express from 'express';
import request from 'supertest';

const mockCreate = jest.fn();
const mockFindFirst = jest.fn();

jest.mock('../../lib/prisma', () => ({
  prisma: {
    contractPauseLog: {
      create: (...args: unknown[]) => mockCreate(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
  },
}));

import adminPauseRoutes from '../admin.pause.routes';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminPauseRoutes);
  return app;
}

describe('admin.pause.routes', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockFindFirst.mockReset();
  });

  describe('POST /admin/pause', () => {
    it('writes a ContractPauseLog and returns success on the happy path', async () => {
      const log = {
        id: 'log-1',
        guardianAddress: 'GABC123',
        paused: true,
        reason: 'maintenance',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
      };
      mockCreate.mockResolvedValue(log);

      const res = await request(buildApp())
        .post('/admin/pause')
        .send({ guardianAddress: 'GABC123', reason: 'maintenance' });

      expect(res.status).toBe(200);
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          guardianAddress: 'GABC123',
          paused: true,
        }),
      });
    });

    it('rejects a request missing guardianAddress without writing', async () => {
      const res = await request(buildApp())
        .post('/admin/pause')
        .send({ reason: 'maintenance' });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('POST /admin/unpause', () => {
    it('writes a ContractPauseLog and returns success on the happy path', async () => {
      const log = {
        id: 'log-2',
        guardianAddress: 'GABC123',
        paused: false,
        reason: 'resolved',
        createdAt: new Date('2024-01-02T00:00:00.000Z'),
      };
      mockCreate.mockResolvedValue(log);

      const res = await request(buildApp())
        .post('/admin/unpause')
        .send({ guardianAddress: 'GABC123', reason: 'resolved' });

      expect(res.status).toBe(200);
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          guardianAddress: 'GABC123',
          paused: false,
        }),
      });
    });

    it('rejects a request missing guardianAddress without writing', async () => {
      const res = await request(buildApp())
        .post('/admin/unpause')
        .send({ reason: 'resolved' });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('GET /admin/pause-status', () => {
    it('returns the latest log entry ordered by createdAt desc', async () => {
      const latest = {
        id: 'log-3',
        guardianAddress: 'GABC123',
        paused: true,
        reason: 'maintenance',
        createdAt: new Date('2024-02-01T00:00:00.000Z'),
      };
      mockFindFirst.mockResolvedValue(latest);

      const res = await request(buildApp()).get('/admin/pause-status');

      expect(res.status).toBe(200);
      expect(mockFindFirst).toHaveBeenCalledTimes(1);
      expect(mockFindFirst).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
      });
      expect(res.body).toEqual(
        expect.objectContaining({ id: 'log-3', paused: true }),
      );
    });
  });
});
