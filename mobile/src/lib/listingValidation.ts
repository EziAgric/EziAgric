/**
 * Client-side listing validation. Limits mirror the backend's listing
 * schema so users see the same rejections locally instead of after an upload.
 * Keep in step with the backend validation when it changes.
 */
export const LISTING_LIMITS = {
  maxQuantity: 1_000_000,
  maxPricePerUnit: 1_000_000_000,
  maxDescriptionLength: 1000,
  minPhotos: 1,
  maxPhotos: 5,
} as const;

export const LISTING_UNITS = ['kg', 'tonnes', 'bags (50kg)', 'bags (100kg)'] as const;

export interface ListingFormValues {
  commodity: string;
  region: string;
  quantity: string;
  unit: string;
  pricePerUnit: string;
  description: string;
  photoCount: number;
}

export type ListingFormErrors = Partial<Record<keyof ListingFormValues, string>>;

function positiveNumber(text: string): number | null {
  if (text.trim() === '') return null;
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function validateListingForm(v: ListingFormValues): ListingFormErrors {
  const errors: ListingFormErrors = {};

  if (!v.commodity) errors.commodity = 'Choose a commodity';
  if (!v.region) errors.region = 'Choose a region';

  const qty = positiveNumber(v.quantity);
  if (qty === null) errors.quantity = 'Enter a quantity greater than 0';
  else if (qty > LISTING_LIMITS.maxQuantity) errors.quantity = `Quantity cannot exceed ${LISTING_LIMITS.maxQuantity.toLocaleString()}`;

  if (!(LISTING_UNITS as readonly string[]).includes(v.unit)) errors.unit = 'Choose a unit';

  const price = positiveNumber(v.pricePerUnit);
  if (price === null) errors.pricePerUnit = 'Enter a price greater than 0';
  else if (price > LISTING_LIMITS.maxPricePerUnit) errors.pricePerUnit = 'Price is too high';

  if (v.description.length > LISTING_LIMITS.maxDescriptionLength) {
    errors.description = `Description cannot exceed ${LISTING_LIMITS.maxDescriptionLength} characters`;
  }

  if (v.photoCount < LISTING_LIMITS.minPhotos) errors.photoCount = 'Add at least one photo';
  else if (v.photoCount > LISTING_LIMITS.maxPhotos) errors.photoCount = `At most ${LISTING_LIMITS.maxPhotos} photos`;

  return errors;
}
