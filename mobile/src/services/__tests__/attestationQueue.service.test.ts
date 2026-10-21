/* eslint-disable no-undef, @typescript-eslint/no-explicit-any */
import * as FileSystem from 'expo-file-system';
import { driverApi } from '../../api/driver';
import { useAuthStore } from '../../stores/authStore';
import {
  attestationQueue,
  cacheManifests,
  getCachedManifests,
  persistVideo,
  queueAttestation,
  sqliteQueueStorage,
} from '../attestationQueue.service';

// A tiny fake of the parts of expo-sqlite the service uses.
const mockRows = new Map<string, { created_at: string; data: string }>();
const mockKv = new Map<string, string>();
jest.mock('../offline.service', () => ({
  initDb: jest.fn(async () => ({
    execAsync: jest.fn(),
    runAsync: jest.fn(async (sql: string, p: any[]) => {
      if (sql.startsWith('INSERT OR REPLACE INTO attestation_queue')) mockRows.set(p[0], { created_at: p[1], data: p[2] });
      else if (sql.startsWith('DELETE FROM attestation_queue')) mockRows.delete(p[0]);
      else if (sql.startsWith('INSERT OR REPLACE INTO kv_cache')) mockKv.set(p[0], p[1]);
    }),
    getAllAsync: jest.fn(async () =>
      [...mockRows.values()].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((r) => ({ data: r.data })),
    ),
    getFirstAsync: jest.fn(async (_sql: string, p: any[]) => (mockKv.has(p[0]) ? { value: mockKv.get(p[0]) } : null)),
  })),
}));
jest.mock('expo-file-system', () => ({
  documentDirectory: 'file:///docs/',
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  copyAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../api/driver', () => ({ driverApi: { submitAttestation: jest.fn() } }));

const base = {
  manifestId: 1,
  tradeId: 't1',
  kind: 'PICKUP' as const,
  videoUri: 'file:///docs/attestations/a.mp4',
  durationSec: 9,
  capturedAt: '2026-10-01T10:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRows.clear();
  mockKv.clear();
  useAuthStore.setState({ token: 'tok' });
});

describe('sqliteQueueStorage', () => {
  it('round-trips items through SQLite and removes them', async () => {
    const item = { ...base, id: 'x', createdAt: '2026-10-01T10:00:01.000Z', attempts: 0, status: 'PENDING' as const };
    await sqliteQueueStorage.put(item);
    expect(await sqliteQueueStorage.list()).toEqual([item]);
    await sqliteQueueStorage.put({ ...item, attempts: 2 });
    expect((await sqliteQueueStorage.list())[0].attempts).toBe(2);
    await sqliteQueueStorage.remove('x');
    expect(await sqliteQueueStorage.list()).toEqual([]);
  });
});

describe('attestationQueue (wired)', () => {
  it('uploads with the stored token, then deletes the video file', async () => {
    (driverApi.submitAttestation as jest.Mock).mockResolvedValue(undefined);
    const item = await queueAttestation(base);
    expect(await attestationQueue.pending()).toHaveLength(1);

    expect(await attestationQueue.flush()).toMatchObject({ sent: 1, remaining: 0 });
    expect(driverApi.submitAttestation).toHaveBeenCalledWith(expect.objectContaining({ id: item.id }), 'tok');
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(base.videoUri, { idempotent: true });
    expect(await attestationQueue.items()).toEqual([]);
  });

  it('keeps the item and the video when offline', async () => {
    (driverApi.submitAttestation as jest.Mock).mockRejectedValue(Object.assign(new Error('Network Error'), { request: {} }));
    await queueAttestation(base);
    expect(await attestationQueue.flush()).toMatchObject({ sent: 0, remaining: 1 });
    expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
  });
});

describe('persistVideo', () => {
  it('copies the video out of the cache into the document directory', async () => {
    const dest = await persistVideo('file:///cache/ImagePicker/v.mov');
    expect(FileSystem.copyAsync).toHaveBeenCalledWith({ from: 'file:///cache/ImagePicker/v.mov', to: dest });
    expect(dest.startsWith('file:///docs/attestations/')).toBe(true);
  });
});

describe('manifest cache', () => {
  it('stores and returns the last manifests, null when empty', async () => {
    expect(await getCachedManifests()).toBeNull();
    const m = [{ id: 1, tradeId: 't', vehicleRegistration: 'ABC', routeDescription: 'A-B', expectedDeliveryAt: '2026-10-02T00:00:00Z' }];
    await cacheManifests(m);
    expect(await getCachedManifests()).toEqual(m);
  });
});
