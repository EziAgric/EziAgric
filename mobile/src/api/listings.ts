import apiClient from './client';
import type { Listing, ListingFilters, ListingPage } from '../types/listing';

/** Drop empty filter values so they are not sent as `?commodity=`. */
export function buildListingParams(
  filters: ListingFilters,
  page: number,
  limit: number,
): Record<string, string | number> {
  const params: Record<string, string | number> = { page, limit };
  if (filters.commodity) params.commodity = filters.commodity;
  if (filters.region) params.region = filters.region;
  if (filters.q?.trim()) params.q = filters.q.trim();
  if (filters.minPrice !== undefined) params.minPrice = filters.minPrice;
  if (filters.maxPrice !== undefined) params.maxPrice = filters.maxPrice;
  return params;
}

export const listingApi = {
  async listListings(filters: ListingFilters, page = 1, limit = 20): Promise<ListingPage> {
    const response = await apiClient.get('/listings', {
      params: buildListingParams(filters, page, limit),
    });
    return response.data;
  },

  async getListing(listingId: string): Promise<Listing> {
    const response = await apiClient.get(`/listings/${listingId}`);
    return response.data;
  },
};
