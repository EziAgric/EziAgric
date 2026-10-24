import type { QueuedAttestation } from '../types/driver';

/** Persistence for the queue. SQLite in the app, in-memory in tests. */
export interface QueueStorage {
  list(): Promise<QueuedAttestation[]>;
  put(item: QueuedAttestation): Promise<void>;
  remove(id: string): Promise<void>;
}

export type NewAttestation = Omit<QueuedAttestation, 'id' | 'createdAt' | 'attempts' | 'status' | 'lastError'>;

export interface FlushResult {
  sent: number;
  failed: number;
  /** Items still pending (to be retried later). */
  remaining: number;
}

export interface QueueOptions {
  /** Server-side failures tolerated per item before it is parked as FAILED. */
  maxAttempts?: number;
  /** Called after an item is sent or permanently discarded, e.g. to delete its video file. */
  onItemDone?: (item: QueuedAttestation) => Promise<void> | void;
  newId?: () => string;
  now?: () => Date;
}

export type Sender = (item: QueuedAttestation) => Promise<void>;

/**
 * How a failed send should be handled:
 * - `offline`: no response at all (no connectivity/timeout). Keep the item,
 *   stop flushing, and do not count it against the item.
 * - `retry`: server-side/transient (5xx, 408, 429). Count an attempt, stop flushing.
 * - `permanent`: the server rejected it (other 4xx). Park as FAILED and continue.
 */
export type FailureKind = 'offline' | 'retry' | 'permanent';

export function classifyFailure(err: unknown): FailureKind {
  const e = err as { response?: { status?: number }; request?: unknown; code?: string } | null;
  const status = e?.response?.status;
  if (status === undefined) return 'offline';
  if (status >= 500 || status === 408 || status === 429) return 'retry';
  return 'permanent';
}

function defaultId(): string {
  const r = () => Math.random().toString(16).slice(2, 10);
  return `${Date.now().toString(16)}-${r()}-${r()}`;
}

function errorMessage(err: unknown): string {
  const e = err as { response?: { data?: { error?: unknown } }; message?: string } | null;
  const apiError = e?.response?.data?.error;
  return typeof apiError === 'string' ? apiError : (e?.message ?? 'Upload failed');
}

/**
 * Offline-first queue for driver attestations. Items are persisted before any
 * network call, sent strictly in capture order, and removed only after the
 * server confirms. `flush` calls are serialised so a connectivity flap or
 * overlapping triggers can never upload the same item twice.
 */
export class AttestationQueue {
  private inFlight: Promise<FlushResult> | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly maxAttempts: number;
  private readonly newId: () => string;
  private readonly now: () => Date;

  constructor(
    private readonly storage: QueueStorage,
    private readonly send: Sender,
    private readonly options: QueueOptions = {},
  ) {
    this.maxAttempts = options.maxAttempts ?? 5;
    this.newId = options.newId ?? defaultId;
    this.now = options.now ?? (() => new Date());
  }

  /** Be told whenever the queue contents change (enqueue, send, park, retry, discard). */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  async enqueue(input: NewAttestation): Promise<QueuedAttestation> {
    const item: QueuedAttestation = {
      ...input,
      id: this.newId(),
      createdAt: this.now().toISOString(),
      attempts: 0,
      status: 'PENDING',
    };
    await this.storage.put(item);
    this.notify();
    return item;
  }

  /** All items, oldest first. */
  async items(): Promise<QueuedAttestation[]> {
    const all = await this.storage.list();
    return [...all].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  async pending(): Promise<QueuedAttestation[]> {
    return (await this.items()).filter((i) => i.status === 'PENDING');
  }

  async failed(): Promise<QueuedAttestation[]> {
    return (await this.items()).filter((i) => i.status === 'FAILED');
  }

  /** Put a FAILED item back in the queue for another round of attempts. */
  async retry(id: string): Promise<void> {
    const item = (await this.storage.list()).find((i) => i.id === id);
    if (!item) return;
    await this.storage.put({ ...item, status: 'PENDING', attempts: 0, lastError: undefined });
    this.notify();
  }

  /** Drop an item (user gave up on a FAILED attestation). */
  async discard(id: string): Promise<void> {
    const item = (await this.storage.list()).find((i) => i.id === id);
    await this.storage.remove(id);
    if (item) await this.options.onItemDone?.(item);
    this.notify();
  }

  flush(): Promise<FlushResult> {
    if (!this.inFlight) {
      this.inFlight = this.run().finally(() => {
        this.inFlight = null;
        this.notify();
      });
    }
    return this.inFlight;
  }

  private async run(): Promise<FlushResult> {
    let sent = 0;
    let failed = 0;

    for (const item of await this.pending()) {
      try {
        await this.send(item);
      } catch (err) {
        const kind = classifyFailure(err);
        if (kind === 'offline') break; // keep order; try again when online

        const attempts = item.attempts + 1;
        const park = kind === 'permanent' || attempts >= this.maxAttempts;
        await this.storage.put({
          ...item,
          attempts,
          status: park ? 'FAILED' : 'PENDING',
          lastError: errorMessage(err),
        });
        if (park) {
          failed += 1;
          continue; // a rejected item must not block the ones behind it
        }
        break; // transient server trouble: stop and retry later, in order
      }

      await this.storage.remove(item.id);
      await this.options.onItemDone?.(item);
      sent += 1;
    }

    return { sent, failed, remaining: (await this.pending()).length };
  }
}

/** Simple in-memory storage; used by tests and as a fallback. */
export function createMemoryStorage(initial: QueuedAttestation[] = []): QueueStorage {
  const map = new Map(initial.map((i) => [i.id, i]));
  return {
    list: async () => [...map.values()],
    put: async (item) => {
      map.set(item.id, item);
    },
    remove: async (id) => {
      map.delete(id);
    },
  };
}
