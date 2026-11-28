/**
 * Path payment quote cache with configurable TTL and slippage protection.
 *
 * Caches Horizon path payment quotes in Redis keyed by asset pair + amount,
 * so repeated requests for the same conversion route within the TTL window
 * return the cached result instead of hitting Horizon again.
 *
 * Slippage protection:
 *   - QUOTE_MAX_SLIPPAGE_BPS: maximum allowed deviation between the original
 *     quoted rate and the current market rate. Stale quotes that deviate
 *     beyond this threshold are rejected.
 *   - The response always includes `quotedAt` and `freshnessMs` so the
 *     client can display quote freshness.
 */

import { cacheGet, cacheSet } from "../lib/cache";
import { appLogger } from "../middleware/logger";
import { env } from "../config/env";

const CACHE_KEY_PREFIX = "quote:path:";
const DEFAULT_TTL_SECONDS = 30;

export interface CachedQuote {
  sourceAssetCode: string;
  sourceAssetIssuer?: string;
  sourceAmount: string;
  quotes: Array<{
    source_amount: string;
    source_asset_type: string;
    source_asset_code: string;
    destination_amount: string;
    destination_asset_type: string;
    destination_asset_code: string;
    path: unknown[];
  }>;
  quotedAt: string;
  freshnessMs: number;
}

export interface QuoteRequest {
  sourceAmount: string;
  sourceAssetCode: string;
  sourceAssetIssuer?: string;
}

function cacheKey(request: QuoteRequest): string {
  const issuer = request.sourceAssetIssuer ?? "default";
  return `${CACHE_KEY_PREFIX}${request.sourceAssetCode}:${issuer}:${request.sourceAmount}`;
}

/**
 * Retrieve a cached quote if available and still within TTL.
 */
export async function getCachedQuote(
  request: QuoteRequest,
): Promise<CachedQuote | null> {
  const cached = await cacheGet<CachedQuote>(cacheKey(request));
  if (!cached) return null;

  const ttlSeconds = getQuoteTtlSeconds();
  const ageMs = Date.now() - new Date(cached.quotedAt).getTime();
  if (ageMs > ttlSeconds * 1000) {
    appLogger.debug({ request }, "[QuoteCache] Quote expired");
    return null;
  }

  appLogger.debug({ request }, "[QuoteCache] Cache hit");
  return { ...cached, freshnessMs: ageMs };
}

/**
 * Store a quote in the cache.
 */
export async function setCachedQuote(
  request: QuoteRequest,
  quotes: CachedQuote["quotes"],
): Promise<void> {
  const entry: CachedQuote = {
    sourceAssetCode: request.sourceAssetCode,
    sourceAssetIssuer: request.sourceAssetIssuer,
    sourceAmount: request.sourceAmount,
    quotes,
    quotedAt: new Date().toISOString(),
    freshnessMs: 0,
  };

  await cacheSet(cacheKey(request), entry, getQuoteTtlSeconds());
  appLogger.debug({ request }, "[QuoteCache] Quote cached");
}

/**
 * Invalidate a cached quote (e.g. on trade execution or market event).
 */
export async function invalidateQuoteCache(
  request: QuoteRequest,
): Promise<void> {
  const { redis } = await import("../lib/redis");
  try {
    await redis.del(cacheKey(request));
    appLogger.debug({ request }, "[QuoteCache] Cache invalidated");
  } catch (err) {
    appLogger.warn({ err, request }, "[QuoteCache] Cache invalidation failed");
  }
}

/**
 * Check if a cached quote is within the max slippage tolerance.
 *
 * Compares the cached destination_amount against a fresh quote's
 * destination_amount. Returns true if the deviation is within bounds.
 */
export function isQuoteWithinSlippage(
  cached: CachedQuote,
  freshDestinationAmount: string,
  maxSlippageBps: number = getMaxSlippageBps(),
): boolean {
  if (cached.quotes.length === 0) return false;

  const cachedDest = BigInt(cached.quotes[0].destination_amount);
  const freshDest = BigInt(freshDestinationAmount);

  if (freshDest === 0n) return false;

  // Slippage = |fresh - cached| / fresh * 10_000
  const deviation =
    cachedDest > freshDest
      ? (cachedDest - freshDest) * 10_000n
      : (freshDest - cachedDest) * 10_000n;

  const slippageBps = deviation / freshDest;

  return slippageBps <= BigInt(maxSlippageBps);
}

/**
 * Get the quote TTL in seconds from env or default.
 */
export function getQuoteTtlSeconds(): number {
  return env.QUOTE_CACHE_TTL_SECONDS ?? DEFAULT_TTL_SECONDS;
}

/**
 * Get the max slippage in BPS from env or default.
 */
export function getMaxSlippageBps(): number {
  return env.QUOTE_MAX_SLIPPAGE_BPS ?? 500; // 5% default
}
