import axios from 'axios';

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const DEVIATION_THRESHOLD = 0.2; // 20%

interface PriceCacheEntry {
  prices: Record<string, number>;
  fetchedAt: number;
}

let cache: PriceCacheEntry | null = null;

function normalizeCommodity(commodity: string): string {
  return commodity.trim().toLowerCase();
}

/**
 * Fetch current commodity prices from the configured external price feed.
 * Results are cached for 1 hour to avoid hitting external API rate limits.
 */
export async function getCommodityPrices(): Promise<Record<string, number>> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.prices;
  }

  const apiUrl = process.env.PRICE_FEED_API_URL;
  if (!apiUrl) {
    return cache?.prices ?? {};
  }

  try {
    const headers: Record<string, string> = {};
    if (process.env.PRICE_FEED_API_KEY) {
      headers['Authorization'] = `Bearer ${process.env.PRICE_FEED_API_KEY}`;
    }

    const response = await axios.get(apiUrl, { headers, timeout: 5000 });
    const raw = response.data;
    const prices: Record<string, number> = {};

    const entries: Array<{ commodity?: string; name?: string; price?: number }> =
      Array.isArray(raw) ? raw : Array.isArray(raw?.prices) ? raw.prices : [];

    for (const entry of entries) {
      const key = entry.commodity ?? entry.name;
      if (key && typeof entry.price === 'number') {
        prices[normalizeCommodity(key)] = entry.price;
      }
    }

    cache = { prices, fetchedAt: now };
    return prices;
  } catch (error) {
    // On failure, fall back to any previously cached prices.
    return cache?.prices ?? {};
  }
}

/**
 * Returns the market price per unit for a commodity, or null if unavailable.
 */
export async function getMarketPrice(commodity: string): Promise<number | null> {
  const prices = await getCommodityPrices();
  const price = prices[normalizeCommodity(commodity)];
  return typeof price === 'number' && price > 0 ? price : null;
}

/**
 * Builds an informational warning when the trade's per-unit price deviates
 * more than 20% from the market rate. Returns null when no warning applies.
 */
export async function buildPriceWarning(
  commodity: string,
  perUnitPrice: number
): Promise<string | null> {
  const marketPrice = await getMarketPrice(commodity);
  if (marketPrice === null || !Number.isFinite(perUnitPrice) || perUnitPrice <= 0) {
    return null;
  }

  const deviation = Math.abs(perUnitPrice - marketPrice) / marketPrice;
  if (deviation <= DEVIATION_THRESHOLD) {
    return null;
  }

  const direction = perUnitPrice > marketPrice ? 'above' : 'below';
  const percent = (deviation * 100).toFixed(1);
  return `Price is ${percent}% ${direction} the current market rate of ${marketPrice} per unit for ${commodity}.`;
}
