import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export interface QueuedTradeAction {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

export type QueueListener = (queue: QueuedTradeAction[]) => void;
export type ExpiryListener = (expired: QueuedTradeAction[]) => void;

const STORAGE_KEY = '@handsoff/offline_trade_queue';
const EXPIRY_MS = 24 * 60 * 60 * 1000;

let queue: QueuedTradeAction[] = [];
let loaded = false;
let flushing = false;
let unsubscribeNetInfo: (() => void) | null = null;

const queueListeners = new Set<QueueListener>();
const expiryListeners = new Set<ExpiryListener>();

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function notifyQueue(): void {
  const snapshot = [...queue];
  queueListeners.forEach((listener) => listener(snapshot));
}

function notifyExpired(expired: QueuedTradeAction[]): void {
  if (expired.length === 0) return;
  expiryListeners.forEach((listener) => listener(expired));
}

async function persist(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Persistence failures should not crash the app; queue stays in memory.
  }
}

async function load(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as QueuedTradeAction[];
      if (Array.isArray(parsed)) {
        queue = parsed.filter(
          (item) => item && typeof item.id === 'string' && typeof item.createdAt === 'number',
        );
      }
    }
  } catch {
    queue = [];
  }
  await expireStale();
  notifyQueue();
}

async function expireStale(): Promise<void> {
  const now = Date.now();
  const expired = queue.filter((item) => now - item.createdAt >= EXPIRY_MS);
  if (expired.length === 0) return;
  queue = queue.filter((item) => now - item.createdAt < EXPIRY_MS);
  await persist();
  notifyQueue();
  notifyExpired(expired);
}

/**
 * Buffer a signed trade action locally. Returns the queued entry.
 */
export async function enqueueTradeAction(
  type: string,
  payload: Record<string, unknown>,
): Promise<QueuedTradeAction> {
  await load();
  const action: QueuedTradeAction = {
    id: generateId(),
    type,
    payload,
    createdAt: Date.now(),
  };
  queue = [...queue, action];
  await persist();
  notifyQueue();
  return action;
}

export function getQueuedActions(): QueuedTradeAction[] {
  return [...queue];
}

export function getPendingCount(): number {
  return queue.length;
}

export function subscribeToQueue(listener: QueueListener): () => void {
  queueListeners.add(listener);
  listener([...queue]);
  return () => {
    queueListeners.delete(listener);
  };
}

export function subscribeToExpiry(listener: ExpiryListener): () => void {
  expiryListeners.add(listener);
  return () => {
    expiryListeners.delete(listener);
  };
}

/**
 * Attempt to flush the queue. `send` is invoked per action; actions that
 * resolve are removed, actions that reject remain queued for a later retry.
 */
export async function flushQueue(
  send: (action: QueuedTradeAction) => Promise<void>,
): Promise<void> {
  if (flushing) return;
  await load();
  await expireStale();
  if (queue.length === 0) return;

  flushing = true;
  try {
    const remaining: QueuedTradeAction[] = [];
    for (const action of queue) {
      try {
        await send(action);
      } catch {
        remaining.push(action);
      }
    }
    queue = remaining;
    await persist();
    notifyQueue();
  } finally {
    flushing = false;
  }
}

/**
 * Start listening to NetInfo and automatically flush on reconnect.
 * Returns an unsubscribe function.
 */
export function startAutoRetry(
  send: (action: QueuedTradeAction) => Promise<void>,
): () => void {
  void load();

  const handleState = (state: NetInfoState): void => {
    if (state.isConnected && state.isInternetReachable !== false) {
      void flushQueue(send);
    }
  };

  if (unsubscribeNetInfo) {
    unsubscribeNetInfo();
  }
  unsubscribeNetInfo = NetInfo.addEventListener(handleState);

  return () => {
    if (unsubscribeNetInfo) {
      unsubscribeNetInfo();
      unsubscribeNetInfo = null;
    }
  };
}

export async function clearQueue(): Promise<void> {
  queue = [];
  await persist();
  notifyQueue();
}
