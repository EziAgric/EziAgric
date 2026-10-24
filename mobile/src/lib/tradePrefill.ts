import type { Listing } from '../types/listing';

/** Listing details carried into CreateTrade so the buyer does not retype them. */
export interface TradePrefill {
  listingId: string;
  commodity: string;
  /** Quantity the buyer picked on the listing detail screen. */
  quantity: string;
  unit: string;
  pricePerUnit: string;
  sellerAddress: string;
}

export function buildTradePrefill(listing: Listing, quantity: number): TradePrefill {
  return {
    listingId: listing.id,
    commodity: listing.commodity,
    quantity: String(quantity),
    unit: listing.unit,
    pricePerUnit: listing.pricePerUnit,
    sellerAddress: listing.sellerAddress,
  };
}

/** Smallest quantity a buyer can order: 1 unit, or whatever is left if less than 1. */
export function minOrderQuantity(available: number): number {
  return available >= 1 ? 1 : available;
}

/**
 * Clamp a requested quantity into [min, available]. Non-numeric input falls
 * back to the minimum so the picker can never produce NaN.
 */
export function clampQuantity(value: number, available: number): number {
  const min = minOrderQuantity(available);
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), available);
}

/** Parse a quantity text field; returns NaN for empty/invalid input. */
export function parseQuantity(text: string): number {
  return text.trim() === '' ? NaN : Number(text);
}
