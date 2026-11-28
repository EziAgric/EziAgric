import { redis } from "./redis";
import { appLogger } from "../middleware/logger";
import { alertService } from "../services/alert.service";

const DEFAULT_TTL_SECONDS = 300; // 5 minutes

/**
 * Cache resilience policy: graceful degradation.
 * - On Redis failure, return null (miss) and fall back to DB/Horizon.
 * - cacheSet failures are swallowed with warn + cache_unavailable ticket.
 * - Queue consumers resume cleanly after reconnect (see queue.ts).
 * Documented in docs/redis-resilience.md#cache
 */

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const value = await redis.get(key);
    if (value === null) return null;
    return JSON.parse(value) as T;
  } catch (err) {
    appLogger.warn({ err, key }, "Cache get failed — graceful degradation to DB");
    void alertService.dispatch("cache_unavailable", "Cache get failed — serving via DB fallback", { key, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    appLogger.warn({ err, key }, "Cache set failed — write-through skipped");
    void alertService.dispatch("cache_unavailable", "Cache set failed", { key, error: err instanceof Error ? err.message : String(err) });
  }
}

export async function cacheDel(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (err) {
    appLogger.warn({ err, key }, "Cache del failed — stale entry may persist until TTL");
  }
}

export async function cacheExists(key: string): Promise<boolean> {
  try {
    const exists = await redis.exists(key);
    return exists === 1;
  } catch {
    return false;
  }
}
