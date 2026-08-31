/**
 * Action de-duplication window preventing double-submit.
 * Ensures rapid triple-click yields single intent (server confirms once).
 * Correlation IDs tie toast pending/success/error for unified contract.
 */

export interface DedupEntry {
  key: string;
  correlationId: string;
  idempotencyKey: string;
  timestamp: number;
}

const DEDUP_WINDOW_MS = 3000; // 3s window — matches idempotency lock TTL (30s) but shorter for UX
const dedupMap = new Map<string, DedupEntry>();
let correlationCounter = 0;

export function getCorrelationId(): string {
  correlationCounter += 1;
  return `corr-${correlationCounter}-${Date.now()}`;
}

export function shouldDedup(actionKey: string): { dedup: boolean; entry?: DedupEntry } {
  const existing = dedupMap.get(actionKey);
  if (existing && Date.now() - existing.timestamp < DEDUP_WINDOW_MS) {
    return { dedup: true, entry: existing };
  }
  return { dedup: false };
}

export function registerAction(actionKey: string, correlationId: string, idempotencyKey: string): DedupEntry {
  const entry: DedupEntry = { key: actionKey, correlationId, idempotencyKey, timestamp: Date.now() };
  dedupMap.set(actionKey, entry);
  // Auto-expire
  setTimeout(() => {
    const cur = dedupMap.get(actionKey);
    if (cur?.correlationId === correlationId) dedupMap.delete(actionKey);
  }, DEDUP_WINDOW_MS);
  return entry;
}

export function clearDedup(actionKey: string): void {
  dedupMap.delete(actionKey);
}

export function _clearAllForTests(): void {
  dedupMap.clear();
  correlationCounter = 0;
}

export const DEDUP_WINDOW = DEDUP_WINDOW_MS;
