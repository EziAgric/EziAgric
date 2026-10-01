/* eslint-disable no-undef */
import { buildTradePrefill, clampQuantity, minOrderQuantity, parseQuantity } from '../tradePrefill';
import type { Listing } from '../../types/listing';

const listing: Listing = {
  id: 'l1',
  sellerAddress: 'GSELLER',
  commodity: 'Maize',
  region: 'Kaduna',
  quantity: '100',
  unit: 'kg',
  pricePerUnit: '450',
  photos: [],
  status: 'ACTIVE',
};

describe('buildTradePrefill', () => {
  it('maps a listing and the chosen quantity into CreateTrade fields', () => {
    expect(buildTradePrefill(listing, 25)).toEqual({
      listingId: 'l1',
      commodity: 'Maize',
      quantity: '25',
      unit: 'kg',
      pricePerUnit: '450',
      sellerAddress: 'GSELLER',
    });
  });
});

describe('clampQuantity', () => {
  it('keeps in-range values', () => expect(clampQuantity(10, 100)).toBe(10));
  it('caps at availability', () => expect(clampQuantity(500, 100)).toBe(100));
  it('floors at 1 unit', () => {
    expect(clampQuantity(0, 100)).toBe(1);
    expect(clampQuantity(-5, 100)).toBe(1);
  });
  it('falls back to the minimum for NaN/Infinity', () => {
    expect(clampQuantity(NaN, 100)).toBe(1);
    expect(clampQuantity(Infinity, 100)).toBe(1);
  });
  it('allows a fractional last remainder below 1', () => {
    expect(minOrderQuantity(0.5)).toBe(0.5);
    expect(clampQuantity(3, 0.5)).toBe(0.5);
  });
});

describe('parseQuantity', () => {
  it('parses numbers and rejects blanks/garbage', () => {
    expect(parseQuantity('12.5')).toBe(12.5);
    expect(parseQuantity('  ')).toBeNaN();
    expect(parseQuantity('abc')).toBeNaN();
  });
});
