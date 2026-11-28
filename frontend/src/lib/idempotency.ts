/**
 * Idempotency keys for offline queue & dedup.
 * Backend expects `Idempotency-Key` header (ADR-004). Keys are UUIDv4 stored per action
 * so replay after offline reconnect reuses same key, preventing duplicate trades on retry.
 */

export function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for jest / older env
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const IDEMPOTENCY_STORAGE_PREFIX = "amana:idempotency:";

export function getOrCreateIdempotencyKey(scope: string): string {
  if (typeof window === "undefined") return generateIdempotencyKey();
  const storageKey = `${IDEMPOTENCY_STORAGE_PREFIX}${scope}`;
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const fresh = generateIdempotencyKey();
  sessionStorage.setItem(storageKey, fresh);
  return fresh;
}

export function clearIdempotencyKey(scope: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(`${IDEMPOTENCY_STORAGE_PREFIX}${scope}`);
}
