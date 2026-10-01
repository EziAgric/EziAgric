/* eslint-disable no-undef, @typescript-eslint/no-explicit-any */
import apiClient from './client';
import { driverApi } from './driver';
import type { QueuedAttestation } from '../types/driver';

jest.mock('./client', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

const item: QueuedAttestation = {
  id: 'abc-123',
  manifestId: 7,
  tradeId: 'trade-uuid',
  kind: 'LOSS',
  note: 'Two bags soaked',
  videoUri: 'file:///docs/attestations/v.mp4',
  durationSec: 12,
  capturedAt: '2026-10-01T10:00:00.000Z',
  createdAt: '2026-10-01T10:00:01.000Z',
  attempts: 0,
  status: 'PENDING',
};

// React Native's FormData accepts { uri, name, type } descriptors; record what is appended.
const parts: [string, unknown][] = [];
class RecordingFormData {
  append(key: string, value: unknown) {
    parts.push([key, value]);
  }
}
const RealFormData = (global as any).FormData;
beforeAll(() => {
  (global as any).FormData = RecordingFormData;
});
afterAll(() => {
  (global as any).FormData = RealFormData;
});

describe('driverApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    parts.length = 0;
  });

  it('lists assigned manifests', async () => {
    (apiClient.get as jest.Mock).mockResolvedValue({ data: [{ id: 1 }] });
    expect(await driverApi.listAssignedManifests()).toEqual([{ id: 1 }]);
    expect(apiClient.get).toHaveBeenCalledWith('/manifests/assigned');
  });

  it('uploads to /evidence/video with the queue id as the Idempotency-Key and the auth token', async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({ data: {} });
    await driverApi.submitAttestation(item, 'tok');

    const [url, , config] = (apiClient.post as jest.Mock).mock.calls[0];
    expect(url).toBe('/evidence/video');
    expect(config.headers['Idempotency-Key']).toBe('abc-123');
    expect(config.headers.Authorization).toBe('Bearer tok');
    const fields = Object.fromEntries(parts);
    expect(fields).toMatchObject({
      tradeId: 'trade-uuid',
      manifestId: '7',
      attestationKind: 'LOSS',
      durationSec: '12',
      note: 'Two bags soaked',
    });
    expect(fields.file).toMatchObject({ uri: item.videoUri, type: 'video/mp4' });
  });

  it('omits the Authorization header without a token and omits an empty note', async () => {
    (apiClient.post as jest.Mock).mockResolvedValue({ data: {} });
    await driverApi.submitAttestation({ ...item, note: undefined }, null);
    const [, , config] = (apiClient.post as jest.Mock).mock.calls[0];
    expect(config.headers.Authorization).toBeUndefined();
    expect(parts.some(([k]) => k === 'note')).toBe(false);
  });
});
