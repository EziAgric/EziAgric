/* eslint-disable no-undef, @typescript-eslint/no-explicit-any */
import { AttestationQueue, classifyFailure, createMemoryStorage, type NewAttestation } from '../attestationQueue';
import type { QueuedAttestation } from '../../types/driver';

const input = (n: number, kind: NewAttestation['kind'] = 'PICKUP'): NewAttestation => ({
  manifestId: n,
  tradeId: `trade-${n}`,
  kind,
  videoUri: `file:///docs/v${n}.mp4`,
  durationSec: 8,
  capturedAt: '2026-10-01T10:00:00.000Z',
});

const networkError = () => Object.assign(new Error('Network Error'), { request: {} });
const httpError = (status: number, error = 'nope') =>
  Object.assign(new Error(`HTTP ${status}`), { response: { status, data: { error } } });

function makeQueue(send: jest.Mock, extra: Partial<ConstructorParameters<typeof AttestationQueue>[2]> = {}) {
  let tick = 0;
  let id = 0;
  const storage = createMemoryStorage();
  const queue = new AttestationQueue(storage, send, {
    newId: () => `id-${++id}`,
    now: () => new Date(Date.UTC(2026, 9, 1, 10, 0, ++tick)),
    ...extra,
  });
  return { queue, storage };
}

describe('classifyFailure', () => {
  it('treats no response as offline', () => expect(classifyFailure(networkError())).toBe('offline'));
  it.each([500, 502, 503, 408, 429])('treats %d as retryable', (s) => expect(classifyFailure(httpError(s))).toBe('retry'));
  it.each([400, 401, 403, 404, 413, 415, 422])('treats %d as permanent', (s) =>
    expect(classifyFailure(httpError(s))).toBe('permanent'),
  );
});

describe('AttestationQueue', () => {
  it('persists an item as PENDING before any network call', async () => {
    const send = jest.fn();
    const { queue, storage } = makeQueue(send);
    const item = await queue.enqueue(input(1));
    expect(send).not.toHaveBeenCalled();
    expect(item).toMatchObject({ id: 'id-1', status: 'PENDING', attempts: 0, manifestId: 1 });
    expect(await storage.list()).toEqual([item]);
  });

  it('survives a restart: a new queue over the same storage sees and sends the items', async () => {
    const send = jest.fn().mockResolvedValue(undefined);
    const { queue, storage } = makeQueue(jest.fn());
    await queue.enqueue(input(1));
    const reborn = new AttestationQueue(storage, send);
    expect(await reborn.pending()).toHaveLength(1);
    expect(await reborn.flush()).toEqual({ sent: 1, failed: 0, remaining: 0 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('sends in capture order and removes items only after success', async () => {
    const calls: string[] = [];
    const send = jest.fn(async (i: QueuedAttestation) => {
      calls.push(i.id);
    });
    const { queue, storage } = makeQueue(send);
    await queue.enqueue(input(1));
    await queue.enqueue(input(2, 'DELIVERY'));
    await queue.enqueue(input(3, 'LOSS'));
    expect(await queue.flush()).toEqual({ sent: 3, failed: 0, remaining: 0 });
    expect(calls).toEqual(['id-1', 'id-2', 'id-3']);
    expect(await storage.list()).toEqual([]);
  });

  it('while offline keeps everything, stops at the first item, and does not count an attempt', async () => {
    const send = jest.fn().mockRejectedValue(networkError());
    const { queue } = makeQueue(send);
    await queue.enqueue(input(1));
    await queue.enqueue(input(2));
    expect(await queue.flush()).toEqual({ sent: 0, failed: 0, remaining: 2 });
    expect(send).toHaveBeenCalledTimes(1); // did not hammer the second item
    expect((await queue.pending()).map((i) => i.attempts)).toEqual([0, 0]);
  });

  it('syncs the backlog once connectivity returns', async () => {
    const send = jest.fn().mockRejectedValueOnce(networkError()).mockResolvedValue(undefined);
    const { queue } = makeQueue(send);
    await queue.enqueue(input(1));
    await queue.enqueue(input(2));
    await queue.flush(); // offline
    expect(await queue.flush()).toEqual({ sent: 2, failed: 0, remaining: 0 });
  });

  it('transient server errors count attempts, preserve order, and park the item after maxAttempts', async () => {
    const send = jest.fn().mockRejectedValue(httpError(503, 'busy'));
    const { queue } = makeQueue(send, { maxAttempts: 3 });
    await queue.enqueue(input(1));
    await queue.enqueue(input(2));

    expect(await queue.flush()).toEqual({ sent: 0, failed: 0, remaining: 2 });
    expect((await queue.items())[0]).toMatchObject({ attempts: 1, status: 'PENDING', lastError: 'busy' });
    await queue.flush();
    const last = await queue.flush();
    expect(last.failed).toBe(1);
    expect((await queue.failed()).map((i) => i.id)).toEqual(['id-1']);
    expect((await queue.failed())[0]).toMatchObject({ attempts: 3, status: 'FAILED' });
  });

  it('a permanently rejected item is parked and does not block the ones behind it', async () => {
    const send = jest
      .fn()
      .mockRejectedValueOnce(httpError(422, 'hash mismatch'))
      .mockResolvedValue(undefined);
    const { queue } = makeQueue(send);
    await queue.enqueue(input(1));
    await queue.enqueue(input(2));
    expect(await queue.flush()).toEqual({ sent: 1, failed: 1, remaining: 0 });
    expect((await queue.failed())[0]).toMatchObject({ id: 'id-1', lastError: 'hash mismatch' });
    // A FAILED item is not retried automatically.
    await queue.flush();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('retry() puts a FAILED item back with a fresh attempt budget; discard() drops it and cleans up', async () => {
    const onItemDone = jest.fn();
    const send = jest.fn().mockRejectedValueOnce(httpError(400)).mockResolvedValue(undefined);
    const { queue } = makeQueue(send, { onItemDone });
    await queue.enqueue(input(1));
    await queue.flush();
    expect(await queue.failed()).toHaveLength(1);

    await queue.retry('id-1');
    expect(await queue.failed()).toHaveLength(0);
    expect((await queue.pending())[0]).toMatchObject({ attempts: 0, lastError: undefined });
    expect(await queue.flush()).toEqual({ sent: 1, failed: 0, remaining: 0 });

    await queue.enqueue(input(2));
    send.mockRejectedValueOnce(httpError(400));
    await queue.flush();
    await queue.discard('id-2');
    expect(await queue.items()).toEqual([]);
    expect(onItemDone).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'id-2' }));
  });

  it('calls onItemDone for each successfully sent item (e.g. to delete the video file)', async () => {
    const onItemDone = jest.fn();
    const { queue } = makeQueue(jest.fn().mockResolvedValue(undefined), { onItemDone });
    await queue.enqueue(input(1));
    await queue.flush();
    expect(onItemDone).toHaveBeenCalledWith(expect.objectContaining({ videoUri: 'file:///docs/v1.mp4' }));
  });

  it('serialises overlapping flushes so an item is never uploaded twice', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const send = jest.fn(() => gate);
    const { queue } = makeQueue(send);
    await queue.enqueue(input(1));

    const a = queue.flush();
    const b = queue.flush();
    expect(a).toBe(b);
    release();
    await Promise.all([a, b]);
    expect(send).toHaveBeenCalledTimes(1);

    // And a flush after completion starts a fresh run.
    await queue.enqueue(input(2));
    release();
    await queue.flush();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('sends the same id on every retry (used as the Idempotency-Key)', async () => {
    const ids: string[] = [];
    const send = jest.fn(async (i: QueuedAttestation) => {
      ids.push(i.id);
      if (ids.length < 3) throw networkError();
    });
    const { queue } = makeQueue(send);
    await queue.enqueue(input(1));
    await queue.flush();
    await queue.flush();
    await queue.flush();
    expect(ids).toEqual(['id-1', 'id-1', 'id-1']);
  });

  it('notifies subscribers on changes and stops after unsubscribe', async () => {
    const { queue } = makeQueue(jest.fn().mockResolvedValue(undefined));
    const listener = jest.fn();
    const off = queue.subscribe(listener);
    await queue.enqueue(input(1));
    expect(listener).toHaveBeenCalledTimes(1);
    await queue.flush();
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    await queue.enqueue(input(2));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
