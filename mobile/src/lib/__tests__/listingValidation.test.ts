/* eslint-disable no-undef */
import { LISTING_LIMITS, validateListingForm, type ListingFormValues } from '../listingValidation';

const valid: ListingFormValues = {
  commodity: 'maize',
  region: 'NG-KD',
  quantity: '500',
  unit: 'kg',
  pricePerUnit: '450',
  description: 'Dry, 2026 harvest',
  photoCount: 2,
};

describe('validateListingForm', () => {
  it('accepts a valid form', () => {
    expect(validateListingForm(valid)).toEqual({});
  });

  it('requires commodity, region and a photo', () => {
    expect(validateListingForm({ ...valid, commodity: '', region: '', photoCount: 0 })).toEqual({
      commodity: 'Choose a commodity',
      region: 'Choose a region',
      photoCount: 'Add at least one photo',
    });
  });

  it.each(['', '0', '-3', 'abc', 'NaN', 'Infinity'])('rejects quantity %p', (q) => {
    expect(validateListingForm({ ...valid, quantity: q }).quantity).toBeDefined();
  });

  it('rejects quantity and price above the limits', () => {
    expect(validateListingForm({ ...valid, quantity: String(LISTING_LIMITS.maxQuantity + 1) }).quantity).toMatch(/cannot exceed/);
    expect(validateListingForm({ ...valid, pricePerUnit: String(LISTING_LIMITS.maxPricePerUnit + 1) }).pricePerUnit).toBeDefined();
    expect(validateListingForm({ ...valid, quantity: String(LISTING_LIMITS.maxQuantity) }).quantity).toBeUndefined();
  });

  it('rejects unknown units', () => {
    expect(validateListingForm({ ...valid, unit: 'litres' }).unit).toBeDefined();
  });

  it('caps description length and photo count', () => {
    expect(validateListingForm({ ...valid, description: 'x'.repeat(1001) }).description).toBeDefined();
    expect(validateListingForm({ ...valid, description: 'x'.repeat(1000) }).description).toBeUndefined();
    expect(validateListingForm({ ...valid, photoCount: 6 }).photoCount).toBeDefined();
    expect(validateListingForm({ ...valid, photoCount: 5 }).photoCount).toBeUndefined();
  });
});
