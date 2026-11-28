/**
 * Structured offline cache for domain data (trades, notifications).
 *
 * Design goals
 * ────────────
 * 1. Stale-while-revalidate: callers receive cached data immediately, then
 *    refresh in the background when online.
 * 2. Per-domain TTLs: trades list = 5 min, individual trades = 10 min,
 *    notifications = 2 min.  Expired entries are served but flagged as stale.
 * 3. Write-path passthrough: mutations (create, deposit, confirm, etc.) are
 *    queued in the offline write queue (see offlineWriteQueue.ts / issue #74)
 *    when offline; cache is invalidated on success.
 * 4. Conflict resolution: local writes never silently overwrite newer server
 *    data.  See CONFLICT_MATRIX below and docs/offline-cache-conflict-matrix.md.
 * 5. Storage quota: total serialised payload is capped at QUOTA_BYTES.  When
 *    full, the LRU domain + key is evicted first.
 * 6. Corruption recovery: any JSON parse / structure error clears the cache
 *    for that domain and continues; the app never hard-crashes on bad storage.
 * 7. Survives restarts: backed by localStorage (available SSR-safe via guard).
 *
 * ──────────────────────────────────────────────────────────────────────────
 * CONFLICT MATRIX (server wins on freshness; see docs for full rationale)
 * ──────────────────────────────────────────────────────────────────────────
 *
 * | Scenario                             | Winner  | Behaviour                          |
 * |--------------------------------------|---------|-------------------------------------|
 * | Online write succeeds                | Server  | Cache invalidated; fresh fetch      |
 * | Offline queue replayed; server 2xx   | Server  | Response written to cache           |
 * | Offline queue replayed; server 409   | Server  | Local entry evicted; user notified  |
 * | Server data newer than local         | Server  | Overwrites local; staleness cleared |
 * | Local data newer (clock skew ≤30s)   | Server  | Server still wins; clock skew noted |
 * | Corruption in storage                | Neither | Domain cache cleared; fresh fetch   |
 *
 * The full matrix including merge rules for list vs. detail entries is
 * documented in docs/offline-cache-conflict-matrix.md.
 * ──────────────────────────────────────────────────────────────────────────
 */

// ─── Constants ─────────────────────────────────────────────────────────────

/** Maximum total bytes stored under the STORAGE_PREFIX namespace. */
export const QUOTA_BYTES = 2 * 1024 * 1024; // 2 MB

const STORAGE_PREFIX = "amana_cache_v1";

/** TTLs in milliseconds per domain. */
export const TTL_MS: Record<CacheDomain, number> = {
  trades_list: 5 * 60 * 1000,    // 5 min
  trade_detail: 10 * 60 * 1000,  // 10 min
  notifications: 2 * 60 * 1000,  // 2 min
};

// ─── Types ──────────────────────────────────────────────────────────────────

export type CacheDomain = "trades_list" | "trade_detail" | "notifications";

export interface CacheEntry<T> {
  data: T;
  /** Unix timestamp (ms) when the entry was written. */
  cachedAt: number;
  /** True when cachedAt + TTL has elapsed but data is still served. */
  isStale: boolean;
}

export interface CacheReadResult<T> {
  entry: CacheEntry<T> | null;
  /** True when an entry exists but TTL has elapsed. */
  isStale: boolean;
  /** True when no entry exists for this key. */
  isMiss: boolean;
}

// ─── Storage helpers ────────────────────────────────────────────────────────

function storageKey(domain: CacheDomain, key: string): string {
  return `${STORAGE_PREFIX}:${domain}:${key}`;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/**
 * Compute total bytes used across all cache keys.
 * Used for quota enforcement.
 */
export function getCacheUsageBytes(): number {
  if (!isBrowser()) return 0;
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(STORAGE_PREFIX)) {
      total += (localStorage.getItem(k)?.length ?? 0) * 2; // UTF-16 ~ 2 bytes/char
    }
  }
  return total;
}

/**
 * Evict the single least-recently-written cache entry to free space.
 * Called when a write would exceed QUOTA_BYTES.
 */
function evictLRU(): void {
  if (!isBrowser()) return;
  let oldestKey: string | null = null;
  let oldestTime = Infinity;

  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k?.startsWith(STORAGE_PREFIX)) continue;
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { cachedAt?: number };
      const t = parsed.cachedAt ?? 0;
      if (t < oldestTime) {
        oldestTime = t;
        oldestKey = k;
      }
    } catch {
      // Corrupt entry — evict it first
      oldestKey = k;
      break;
    }
  }

  if (oldestKey) {
    localStorage.removeItem(oldestKey);
  }
}

// ─── Core read / write ───────────────────────────────────────────────────────

/**
 * Write a value into the cache under domain + key.
 * Enforces quota by evicting LRU entries until enough space exists.
 */
export function cacheWrite<T>(
  domain: CacheDomain,
  key: string,
  data: T,
): void {
  if (!isBrowser()) return;

  const entry: CacheEntry<T> = {
    data,
    cachedAt: Date.now(),
    isStale: false,
  };

  const serialised = JSON.stringify(entry);
  const entryBytes = serialised.length * 2;

  // Enforce quota: evict until there is room
  let attempts = 0;
  while (
    getCacheUsageBytes() + entryBytes > QUOTA_BYTES &&
    attempts < 100
  ) {
    evictLRU();
    attempts++;
  }

  try {
    localStorage.setItem(storageKey(domain, key), serialised);
  } catch {
    // localStorage full or blocked (e.g. private mode with full storage)
    // Fail silently — the cache is best-effort
  }
}

/**
 * Read a value from the cache.
 * Returns a hit (possibly stale) or a miss.
 * Recovers gracefully from corrupt storage by clearing the affected key.
 */
export function cacheRead<T>(
  domain: CacheDomain,
  key: string,
): CacheReadResult<T> {
  if (!isBrowser()) {
    return { entry: null, isStale: false, isMiss: true };
  }

  const raw = localStorage.getItem(storageKey(domain, key));
  if (!raw) {
    return { entry: null, isStale: false, isMiss: true };
  }

  try {
    const entry = JSON.parse(raw) as CacheEntry<T>;

    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof entry.cachedAt !== "number" ||
      !("data" in entry)
    ) {
      throw new Error("Malformed cache entry");
    }

    const isStale = Date.now() - entry.cachedAt > TTL_MS[domain];
    return { entry: { ...entry, isStale }, isStale, isMiss: false };
  } catch {
    // Corruption — clear and treat as miss
    localStorage.removeItem(storageKey(domain, key));
    return { entry: null, isStale: false, isMiss: true };
  }
}

/**
 * Invalidate a single cache entry.
 */
export function cacheInvalidate(domain: CacheDomain, key: string): void {
  if (!isBrowser()) return;
  localStorage.removeItem(storageKey(domain, key));
}

/**
 * Clear all cache entries for a domain.
 */
export function cacheClearDomain(domain: CacheDomain): void {
  if (!isBrowser()) return;
  const prefix = `${STORAGE_PREFIX}:${domain}:`;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(prefix)) toRemove.push(k);
  }
  toRemove.forEach((k) => localStorage.removeItem(k));
}

/**
 * Clear every cache entry managed by this module.
 */
export function cacheClearAll(): void {
  if (!isBrowser()) return;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(STORAGE_PREFIX)) toRemove.push(k);
  }
  toRemove.forEach((k) => localStorage.removeItem(k));
}
