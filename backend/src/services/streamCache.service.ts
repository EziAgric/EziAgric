import { StreamStatus } from "@prisma/client";
import { cacheGet, cacheSet } from "../lib/cache";
import { redis } from "../lib/redis";
import { prisma } from "../lib/db";
import { appLogger } from "../middleware/logger";

const CACHE_KEY_PREFIX = "stream:state:";
const CACHE_TTL_SECONDS = 60;

export interface CachedStreamState {
  streamId: string;
  status: StreamStatus;
  totalVested: string;
  claimed: string;
  unclaimed: string;
  pendingClawback: string;
  terminatedAt: string | null;
  terminatedBy: string | null;
  terminationReason: string | null;
  cachedAt: string;
}

function cacheKey(streamId: string): string {
  return `${CACHE_KEY_PREFIX}${streamId}`;
}

export async function getCachedStreamState(
  streamId: string,
): Promise<CachedStreamState | null> {
  const cached = await cacheGet<CachedStreamState>(cacheKey(streamId));
  if (cached) {
    appLogger.debug({ streamId }, "[StreamCache] Cache hit");
    return cached;
  }

  appLogger.debug({ streamId }, "[StreamCache] Cache miss, fetching from DB");
  const stream = await prisma.stream.findUnique({ where: { streamId } });
  if (!stream) return null;

  const state: CachedStreamState = {
    streamId: stream.streamId,
    status: stream.status,
    totalVested: stream.totalVested,
    claimed: stream.claimed,
    unclaimed: stream.unclaimed,
    pendingClawback: stream.pendingClawback,
    terminatedAt: stream.terminatedAt?.toISOString() ?? null,
    terminatedBy: stream.terminatedBy,
    terminationReason: stream.terminationReason,
    cachedAt: new Date().toISOString(),
  };

  await cacheSet(cacheKey(streamId), state, CACHE_TTL_SECONDS);
  return state;
}

export async function invalidateStreamCache(
  streamId: string,
): Promise<void> {
  try {
    await redis.del(cacheKey(streamId));
    appLogger.debug({ streamId }, "[StreamCache] Cache invalidated");
  } catch (err) {
    appLogger.warn({ err, streamId }, "[StreamCache] Cache invalidation failed");
  }
}

export function streamCacheKeyPrefix(): string {
  return CACHE_KEY_PREFIX;
}
