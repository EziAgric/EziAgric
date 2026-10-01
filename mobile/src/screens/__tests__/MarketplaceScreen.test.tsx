/* eslint-disable no-undef, @typescript-eslint/no-explicit-any */
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import MarketplaceScreen, { countActiveFilters } from '../MarketplaceScreen';
import { listingApi } from '../../api/listings';
import { referenceApi } from '../../api/reference';
import type { Listing } from '../../types/listing';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../api/listings', () => ({
  ...jest.requireActual('../../api/listings'),
  listingApi: { listListings: jest.fn(), getListing: jest.fn() },
}));

jest.mock('../../api/reference', () => ({
  ...jest.requireActual('../../api/reference'),
  referenceApi: { listCommodities: jest.fn(), listRegions: jest.fn() },
}));

const mockList = listingApi.listListings as jest.Mock;

function makeListing(n: number, overrides: Partial<Listing> = {}): Listing {
  return {
    id: `l${n}`,
    sellerAddress: 'G'.padEnd(56, 'A'),
    commodity: `Maize${n}`,
    region: 'Kaduna',
    quantity: '100',
    unit: 'kg',
    pricePerUnit: '500',
    photos: [],
    status: 'ACTIVE',
    ...overrides,
  };
}

function setup() {
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  const utils = render(<MarketplaceScreen {...({ navigation, route: { params: undefined } } as any)} />);
  return { navigation, ...utils };
}

beforeEach(() => {
  jest.clearAllMocks();
  (referenceApi.listCommodities as jest.Mock).mockResolvedValue([
    { code: 'maize', name: 'Maize' },
    { code: 'rice', name: 'Rice' },
  ]);
  (referenceApi.listRegions as jest.Mock).mockResolvedValue([{ code: 'NG-KD', name: 'Kaduna' }]);
});

describe('MarketplaceScreen', () => {
  it('renders listings from the first page', async () => {
    mockList.mockResolvedValue({ listings: [makeListing(1), makeListing(2)], total: 2, page: 1, limit: 20 });
    const { findByText } = setup();
    expect(await findByText('Maize1')).toBeTruthy();
    expect(await findByText('Maize2')).toBeTruthy();
    expect(mockList).toHaveBeenCalledWith({}, 1, 20);
  });

  it('shows an empty state', async () => {
    mockList.mockResolvedValue({ listings: [], total: 0, page: 1, limit: 20 });
    const { findByText } = setup();
    expect(await findByText('No listings match your filters.')).toBeTruthy();
  });

  it('shows an error with retry when the first load fails', async () => {
    mockList.mockRejectedValueOnce(new Error('boom'));
    mockList.mockResolvedValueOnce({ listings: [makeListing(1)], total: 1, page: 1, limit: 20 });
    const { findByText, getByTestId } = setup();
    expect(await findByText('boom')).toBeTruthy();
    fireEvent.press(getByTestId('marketplace-retry'));
    expect(await findByText('Maize1')).toBeTruthy();
  });

  it('navigates to listing detail when a card is pressed', async () => {
    mockList.mockResolvedValue({ listings: [makeListing(1)], total: 1, page: 1, limit: 20 });
    const { findByTestId, navigation } = setup();
    fireEvent.press(await findByTestId('listing-card-l1'));
    expect(navigation.navigate).toHaveBeenCalledWith('ListingDetail', { listingId: 'l1' });
  });

  it('pull-to-refresh reloads page 1', async () => {
    mockList.mockResolvedValue({ listings: [makeListing(1)], total: 1, page: 1, limit: 20 });
    const { findByTestId } = setup();
    const list = await findByTestId('marketplace-list');
    mockList.mockResolvedValue({ listings: [makeListing(9)], total: 1, page: 1, limit: 20 });
    await act(async () => {
      await list.props.refreshControl.props.onRefresh();
    });
    expect(mockList).toHaveBeenLastCalledWith({}, 1, 20);
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
  });

  it('infinite scroll appends the next page, de-duplicates, and stops at total', async () => {
    mockList.mockResolvedValueOnce({
      listings: [makeListing(1), makeListing(2)],
      total: 3,
      page: 1,
      limit: 20,
    });
    const { findByTestId, findByText } = setup();
    const list = await findByTestId('marketplace-list');

    mockList.mockResolvedValueOnce({
      listings: [makeListing(2), makeListing(3)],
      total: 3,
      page: 2,
      limit: 20,
    });
    await act(async () => {
      list.props.onEndReached();
    });
    expect(await findByText('Maize3')).toBeTruthy();
    expect(mockList).toHaveBeenLastCalledWith({}, 2, 20);
    expect(mockList).toHaveBeenCalledTimes(2);

    // All 3 loaded: further end-reached events must not fetch again.
    await act(async () => {
      (await findByTestId('marketplace-list')).props.onEndReached();
    });
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it('applies filters from the sheet and refetches from page 1', async () => {
    mockList.mockResolvedValue({ listings: [makeListing(1)], total: 1, page: 1, limit: 20 });
    const { findByTestId, getByTestId } = setup();
    await findByTestId('listing-card-l1');

    fireEvent.press(getByTestId('open-filters'));
    fireEvent.press(await findByTestId('filter-commodity-rice'));
    fireEvent.press(await findByTestId('filter-region-NG-KD'));
    fireEvent.changeText(getByTestId('filter-min-price'), '100');
    fireEvent.changeText(getByTestId('filter-max-price'), '900');
    fireEvent.press(getByTestId('filters-apply'));

    await waitFor(() =>
      expect(mockList).toHaveBeenLastCalledWith(
        { commodity: 'rice', region: 'NG-KD', minPrice: 100, maxPrice: 900 },
        1,
        20,
      ),
    );
  });

  it('blocks applying when min price exceeds max price', async () => {
    mockList.mockResolvedValue({ listings: [], total: 0, page: 1, limit: 20 });
    const { getByTestId, findByText } = setup();
    fireEvent.press(getByTestId('open-filters'));
    fireEvent.changeText(getByTestId('filter-min-price'), '900');
    fireEvent.changeText(getByTestId('filter-max-price'), '100');
    expect(await findByText('Minimum price must not exceed maximum.')).toBeTruthy();
    const callsBefore = mockList.mock.calls.length;
    fireEvent.press(getByTestId('filters-apply'));
    expect(mockList.mock.calls.length).toBe(callsBefore);
  });

  it('debounces search text into the q filter', async () => {
    jest.useFakeTimers();
    try {
      mockList.mockResolvedValue({ listings: [], total: 0, page: 1, limit: 20 });
      const { getByTestId } = setup();
      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      fireEvent.changeText(getByTestId('marketplace-search'), 'yam');
      expect(mockList).not.toHaveBeenCalledWith({ q: 'yam' }, 1, 20);
      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      expect(mockList).toHaveBeenLastCalledWith({ q: 'yam' }, 1, 20);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('countActiveFilters', () => {
  it('counts narrowing filters but not search text', () => {
    expect(countActiveFilters({ q: 'x' })).toBe(0);
    expect(countActiveFilters({ commodity: 'rice', region: 'NG-KD', minPrice: 0, maxPrice: 5 })).toBe(4);
  });
});
