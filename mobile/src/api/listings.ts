import apiClient from './client';
import type { Listing, ListingFilters, ListingPage } from '../types/listing';
import type { ListingPhoto } from '../lib/listingPhotos';

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

export interface CreateListingInput {
  commodity: string;
  region: string;
  quantity: string;
  unit: string;
  pricePerUnit: string;
  description?: string;
  photos: ListingPhoto[];
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

  /** Multipart upload: text fields plus one `photos` part per compressed image. */
  async createListing(input: CreateListingInput): Promise<Listing> {
    const form = new FormData();
    form.append('commodity', input.commodity);
    form.append('region', input.region);
    form.append('quantity', input.quantity);
    form.append('unit', input.unit);
    form.append('pricePerUnit', input.pricePerUnit);
    if (input.description) form.append('description', input.description);
    for (const photo of input.photos) {
      // React Native's FormData accepts a { uri, name, type } descriptor.
      form.append('photos', { uri: photo.uri, name: photo.name, type: photo.type } as unknown as Blob);
    }
    const response = await apiClient.post('/listings', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    });
    return response.data;
  },
};
