/* eslint-disable no-undef */
import { buildListingParams } from './listings';

describe('buildListingParams', () => {
  it('always includes paging', () => {
    expect(buildListingParams({}, 2, 20)).toEqual({ page: 2, limit: 20 });
  });

  it('omits empty filters and trims search', () => {
    expect(buildListingParams({ commodity: '', region: undefined, q: '  ' }, 1, 20)).toEqual({ page: 1, limit: 20 });
    expect(buildListingParams({ q: ' rice ' }, 1, 20)).toEqual({ page: 1, limit: 20, q: 'rice' });
  });

  it('keeps a zero minimum price', () => {
    expect(buildListingParams({ minPrice: 0, maxPrice: 10 }, 1, 20)).toMatchObject({ minPrice: 0, maxPrice: 10 });
  });
});
