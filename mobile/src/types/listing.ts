export type ListingStatus = 'ACTIVE' | 'SOLD' | 'EXPIRED' | 'REMOVED';

export interface Listing {
  id: string;
  sellerAddress: string;
  commodity: string;
  region: string;
  /** Quantity still available, in `unit`. */
  quantity: string;
  unit: string;
  /** Price per `unit`, in NGN. */
  pricePerUnit: string;
  description?: string;
  photos: string[];
  status: ListingStatus;
  createdAt?: string;
}

export interface ListingFilters {
  commodity?: string;
  region?: string;
  minPrice?: number;
  maxPrice?: number;
  /** Free-text search. */
  q?: string;
}

export interface ListingPage {
  listings: Listing[];
  total: number;
  page: number;
  limit: number;
}
