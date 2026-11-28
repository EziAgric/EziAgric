import { useCallback, useEffect, useRef, useState } from 'react';

const REFRESH_INTERVAL_MS = 60_000;
const DEFAULT_RATE = 1;

/**
 * Backend endpoint that returns the current cNGN:NGN rate.
 * Expected response shape: { rate: number } where rate is NGN per 1 cNGN.
 */
const EXCHANGE_RATE_ENDPOINT =
  (import.meta as { env?: Record<string, string> }).env?.VITE_EXCHANGE_RATE_ENDPOINT ??
  '/api/exchange-rate/cngn-ngn';

export interface UseExchangeRateResult {
  /** NGN value of 1 cNGN. */
  rate: number;
  /** Timestamp of the last successful fetch, or null if never fetched. */
  lastUpdated: Date | null;
  /** True while a fetch is in flight. */
  isLoading: boolean;
  /** Error message from the most recent failed fetch, if any. */
  error: string | null;
  /** Manually trigger a refresh. */
  refresh: () => void;
}

async function fetchExchangeRate(signal?: AbortSignal): Promise<number> {
  const response = await fetch(EXCHANGE_RATE_ENDPOINT, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch exchange rate (${response.status})`);
  }

  const data: unknown = await response.json();
  const rate =
    typeof data === 'object' && data !== null && 'rate' in data
      ? Number((data as { rate: unknown }).rate)
      : NaN;

  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error('Invalid exchange rate received');
  }

  return rate;
}

/**
 * Fetches the live cNGN:NGN exchange rate and refreshes it every 60 seconds.
 */
export function useExchangeRate(): UseExchangeRateResult {
  const [rate, setRate] = useState<number>(DEFAULT_RATE);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const mountedRef = useRef(true);

  const refresh = useCallback(() => {
    setRefreshToken((token) => token + 1);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const controller = new AbortController();

    const load = async () => {
      setIsLoading(true);
      try {
        const nextRate = await fetchExchangeRate(controller.signal);
        if (!mountedRef.current) return;
        setRate(nextRate);
        setLastUpdated(new Date());
        setError(null);
      } catch (err) {
        if (!mountedRef.current || controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to fetch exchange rate');
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    };

    void load();
    const intervalId = window.setInterval(() => {
      void load();
    }, REFRESH_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [refreshToken]);

  return { rate, lastUpdated, isLoading, error, refresh };
}

export default useExchangeRate;
