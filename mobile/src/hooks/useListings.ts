import { useCallback, useEffect, useRef, useState } from 'react';
import { listingApi } from '../api/listings';
import type { Listing, ListingFilters } from '../types/listing';

const PAGE_SIZE = 20;

export interface UseListingsResult {
  listings: Listing[];
  isLoading: boolean;
  isRefreshing: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
}

/**
 * Paged marketplace listings. Changing `filters` restarts from page 1;
 * `loadMore` appends the next page; `refresh` (pull-to-refresh) reloads page 1
 * without blanking the list. Responses from a superseded request (filters
 * changed or refreshed meanwhile) are ignored.
 */
export function useListings(filters: ListingFilters): UseListingsResult {
  const [listings, setListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pageRef = useRef(1);
  const listingsRef = useRef<Listing[]>([]);
  const requestId = useRef(0);
  const inFlightMore = useRef(false);
  const filtersKey = JSON.stringify(filters);

  const fetchFirstPage = useCallback(
    async (mode: 'initial' | 'refresh') => {
      const id = ++requestId.current;
      inFlightMore.current = false;
      setIsLoadingMore(false);
      if (mode === 'initial') setIsLoading(true);
      else setIsRefreshing(true);
      setError(null);
      try {
        const result = await listingApi.listListings(JSON.parse(filtersKey), 1, PAGE_SIZE);
        if (id !== requestId.current) return;
        pageRef.current = 1;
        listingsRef.current = result.listings;
        setListings(result.listings);
        setHasMore(result.listings.length > 0 && result.listings.length < result.total);
      } catch (err) {
        if (id !== requestId.current) return;
        setError(err instanceof Error ? err.message : 'Failed to load listings');
      } finally {
        if (id === requestId.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [filtersKey],
  );

  useEffect(() => {
    void fetchFirstPage('initial');
  }, [fetchFirstPage]);

  const refresh = useCallback(() => fetchFirstPage('refresh'), [fetchFirstPage]);

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoading || isRefreshing || inFlightMore.current) return;
    inFlightMore.current = true;
    setIsLoadingMore(true);
    const id = requestId.current;
    const nextPage = pageRef.current + 1;
    try {
      const result = await listingApi.listListings(JSON.parse(filtersKey), nextPage, PAGE_SIZE);
      if (id !== requestId.current) return;
      pageRef.current = nextPage;
      const seen = new Set(listingsRef.current.map((l) => l.id));
      const merged = [...listingsRef.current, ...result.listings.filter((l) => !seen.has(l.id))];
      listingsRef.current = merged;
      setListings(merged);
      setHasMore(result.listings.length > 0 && merged.length < result.total);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load more listings');
    } finally {
      if (id === requestId.current) {
        inFlightMore.current = false;
        setIsLoadingMore(false);
      }
    }
  }, [filtersKey, hasMore, isLoading, isRefreshing]);

  return { listings, isLoading, isRefreshing, isLoadingMore, hasMore, error, refresh, loadMore };
}
